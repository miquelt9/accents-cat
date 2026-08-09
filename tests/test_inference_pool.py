"""Tests for the bounded, in-process inference worker pool."""

from __future__ import annotations

import asyncio
import threading
from typing import Any

import pytest

from backend.inference_pool import (
    InferencePool,
    InferencePoolFull,
    configure_torch_threads,
    default_worker_count,
    resolve_queue_size,
    resolve_worker_count,
)


def run(coro: Any) -> Any:
    return asyncio.run(coro)


def test_worker_default_and_environment_resolution() -> None:
    assert [default_worker_count(value) for value in (1, 2, 3, 4, 8, 16, 32)] == [
        1,
        1,
        2,
        2,
        4,
        8,
        8,
    ]
    assert resolve_worker_count(explicit="3", legacy="1", cpu_count=16) == 3
    assert resolve_worker_count(legacy="2", cpu_count=16) == 2
    assert resolve_worker_count(cpu_count=4) == 2
    assert resolve_queue_size(None) == 20
    assert resolve_queue_size("7") == 7


def test_torch_thread_configuration_avoids_oversubscription() -> None:
    class FakeTorch:
        def __init__(self) -> None:
            self.intra: int | None = None
            self.interop: int | None = None

        def set_num_threads(self, value: int) -> None:
            self.intra = value

        def set_num_interop_threads(self, value: int) -> None:
            self.interop = value

    fake_torch = FakeTorch()
    assert configure_torch_threads(
        workers=4,
        cpu_count=8,
        torch_module=fake_torch,
    ) == (2, 1)
    assert fake_torch.intra == 2
    assert fake_torch.interop == 1


def test_jobs_are_consumed_in_fifo_order() -> None:
    async def scenario() -> list[int]:
        pool = InferencePool(workers=1, max_queue_size=3)
        pool.start()
        started = threading.Event()
        release = threading.Event()

        def job(value: int) -> int:
            if value == 0:
                started.set()
                release.wait(timeout=2)
            return value

        first = pool.submit(job, 0)
        await asyncio.to_thread(started.wait, 2)
        queued = [pool.submit(job, value) for value in (1, 2, 3)]
        release.set()
        executions = await asyncio.gather(
            first.result(), *(item.result() for item in queued)
        )
        await pool.shutdown()
        return [execution.value for execution in executions]

    assert run(scenario()) == [0, 1, 2, 3]


def test_full_queue_rejects_immediately() -> None:
    async def scenario() -> None:
        pool = InferencePool(workers=1, max_queue_size=1)
        pool.start()
        started = threading.Event()
        release = threading.Event()

        def blocking_job(value: int) -> int:
            started.set()
            release.wait(timeout=2)
            return value

        first = pool.submit(blocking_job, 1)
        await asyncio.to_thread(started.wait, 2)
        second = pool.submit(blocking_job, 2)
        with pytest.raises(InferencePoolFull, match="queue is full"):
            pool.submit(blocking_job, 3)
        release.set()
        await first.result()
        await second.result()
        await pool.shutdown()

    run(scenario())


def test_cancelled_queued_job_is_not_executed() -> None:
    async def scenario() -> None:
        pool = InferencePool(workers=1, max_queue_size=2)
        pool.start()
        started = threading.Event()
        release = threading.Event()
        executed: list[int] = []

        def job(value: int) -> int:
            executed.append(value)
            if value == 1:
                started.set()
                release.wait(timeout=2)
            return value

        first = pool.submit(job, 1)
        await asyncio.to_thread(started.wait, 2)
        second = pool.submit(job, 2)
        waiter = asyncio.create_task(second.result())
        await asyncio.sleep(0)
        waiter.cancel()
        with pytest.raises(asyncio.CancelledError):
            await waiter
        assert not second.started
        release.set()
        await first.result()
        await pool.shutdown()
        assert executed == [1]

    run(scenario())


def test_shutdown_finishes_active_job_and_cancels_queued_jobs() -> None:
    async def scenario() -> None:
        pool = InferencePool(workers=1, max_queue_size=2)
        pool.start()
        started = threading.Event()
        release = threading.Event()

        def blocking_job(value: int) -> int:
            started.set()
            release.wait(timeout=2)
            return value

        first = pool.submit(blocking_job, 1)
        await asyncio.to_thread(started.wait, 2)
        second = pool.submit(blocking_job, 2)
        stopping = asyncio.create_task(pool.shutdown())
        await asyncio.sleep(0)
        assert not stopping.done()
        release.set()
        await stopping
        assert (await first.result()).value == 1
        with pytest.raises(asyncio.CancelledError):
            await second.result()
        assert not pool.started

    run(scenario())
