"""Small, bounded in-process worker pool for CPU inference jobs."""

from __future__ import annotations

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import partial
from time import perf_counter
from typing import Any, Callable

logger = logging.getLogger(__name__)

DEFAULT_MAX_QUEUE_SIZE = 20


class InferencePoolError(RuntimeError):
    """Base class for inference pool admission and lifecycle errors."""


class InferencePoolFull(InferencePoolError):
    """Raised when no bounded queue slot is available."""


class InferencePoolClosed(InferencePoolError):
    """Raised when a pool is not accepting new jobs."""


@dataclass(frozen=True)
class InferenceExecution:
    """A completed job and the time it spent waiting for a worker."""

    value: Any
    queue_wait_seconds: float


@dataclass
class _InferenceJob:
    function: Callable[..., Any]
    args: tuple[Any, ...]
    kwargs: dict[str, Any]
    future: asyncio.Future[InferenceExecution]
    enqueued_at: float
    started: bool = False
    cancel_requested: bool = False
    _done_callbacks: list[Callable[["_InferenceJob"], None]] | None = None

    def cancel(self) -> bool:
        """Cancel a queued job; a running sync function cannot be interrupted."""
        if self.started:
            self.cancel_requested = True
            return False
        if self.future.done():
            return False
        self.cancel_requested = True
        self.future.cancel()
        return True

    def add_done_callback(self, callback: Callable[["_InferenceJob"], None]) -> None:
        if self.future.done() and self.started:
            self.future.get_loop().call_soon(callback, self)
            return
        if self._done_callbacks is None:
            self._done_callbacks = []
        self._done_callbacks.append(callback)

    def complete(self) -> None:
        callbacks = self._done_callbacks or []
        self._done_callbacks = None
        for callback in callbacks:
            try:
                callback(self)
            except Exception:  # noqa: BLE001
                logger.exception("Inference job completion callback failed")


_STOP = object()


class InferenceJob:
    """Handle returned by :meth:`InferencePool.submit`."""

    def __init__(self, job: _InferenceJob) -> None:
        self._job = job

    @property
    def started(self) -> bool:
        return self._job.started

    @property
    def done(self) -> bool:
        return self._job.future.done()

    def cancel(self) -> bool:
        """Cancel this job if it has not started running yet."""
        return self._job.cancel()

    def add_done_callback(self, callback: Callable[["InferenceJob"], None]) -> None:
        self._job.add_done_callback(lambda _job: callback(self))

    async def result(self) -> InferenceExecution:
        """Wait without cancelling a running worker when the caller disconnects."""
        try:
            return await asyncio.shield(self._job.future)
        except asyncio.CancelledError:
            self._job.cancel()
            raise


class InferencePool:
    """FIFO asyncio queue backed by one dedicated executor per worker slot."""

    def __init__(self, *, workers: int, max_queue_size: int) -> None:
        if workers < 1:
            raise ValueError("workers must be at least 1")
        if max_queue_size < 1:
            raise ValueError("max_queue_size must be at least 1")
        self.workers = workers
        self.max_queue_size = max_queue_size
        self._queue: asyncio.Queue[_InferenceJob | object] = asyncio.Queue(
            maxsize=max_queue_size
        )
        self._executor: ThreadPoolExecutor | None = None
        self._worker_tasks: list[asyncio.Task[None]] = []
        self._active_workers = 0
        self._queue_wait_total_seconds = 0.0
        self._queue_wait_jobs = 0
        self._started = False
        self._accepting = False
        self._shutdown_complete = False

    @property
    def started(self) -> bool:
        return self._started and not self._shutdown_complete

    @property
    def queue_depth(self) -> int:
        return self._queue.qsize()

    @property
    def active_workers(self) -> int:
        return self._active_workers

    @property
    def average_queue_wait_seconds(self) -> float:
        if self._queue_wait_jobs == 0:
            return 0.0
        return self._queue_wait_total_seconds / self._queue_wait_jobs

    def snapshot(self) -> dict[str, float]:
        """Return low-cardinality runtime state for logs and observable metrics."""
        return {
            "queue_depth": self.queue_depth,
            "active_workers": self.active_workers,
            "workers": self.workers,
            "max_queue_size": self.max_queue_size,
            "queue_wait_average_seconds": self.average_queue_wait_seconds,
        }

    def start(self) -> None:
        if self._shutdown_complete:
            raise InferencePoolClosed("Inference pool has already shut down.")
        if self._started:
            return
        self._executor = ThreadPoolExecutor(
            max_workers=self.workers,
            thread_name_prefix="accent-oracle-inference",
        )
        self._started = True
        self._accepting = True
        self._worker_tasks = [
            asyncio.create_task(self._worker(index), name=f"inference-worker-{index}")
            for index in range(self.workers)
        ]

    def submit(
        self,
        function: Callable[..., Any],
        *args: Any,
        **kwargs: Any,
    ) -> InferenceJob:
        if not self._accepting or self._executor is None:
            raise InferencePoolClosed("Inference pool is not accepting jobs.")

        loop = asyncio.get_running_loop()
        job = _InferenceJob(
            function=function,
            args=args,
            kwargs=kwargs,
            future=loop.create_future(),
            enqueued_at=perf_counter(),
        )
        try:
            self._queue.put_nowait(job)
        except asyncio.QueueFull as exc:
            raise InferencePoolFull("Inference queue is full.") from exc
        return InferenceJob(job)

    async def shutdown(self, *, cancel_queued: bool = True) -> None:
        if self._shutdown_complete:
            return
        self._accepting = False
        if not self._started:
            self._shutdown_complete = True
            return

        if cancel_queued:
            self._cancel_queued_jobs()

        for _ in self._worker_tasks:
            await self._queue.put(_STOP)
        await asyncio.gather(*self._worker_tasks, return_exceptions=True)

        if self._executor is not None:
            self._executor.shutdown(wait=True)
        self._shutdown_complete = True

    def _cancel_queued_jobs(self) -> None:
        while True:
            try:
                item = self._queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            try:
                if item is not _STOP:
                    item.cancel()
                    item.complete()
            finally:
                self._queue.task_done()

    async def _worker(self, index: int) -> None:
        del index
        while True:
            item = await self._queue.get()
            try:
                if item is _STOP:
                    return

                job = item
                if job.cancel_requested or job.future.cancelled():
                    job.complete()
                    continue

                job.started = True
                self._active_workers += 1
                queue_wait = perf_counter() - job.enqueued_at
                self._queue_wait_total_seconds += queue_wait
                self._queue_wait_jobs += 1
                try:
                    assert self._executor is not None
                    loop = asyncio.get_running_loop()
                    call = partial(job.function, *job.args, **job.kwargs)
                    value = await loop.run_in_executor(self._executor, call)
                    if not job.future.done():
                        job.future.set_result(
                            InferenceExecution(
                                value=value,
                                queue_wait_seconds=queue_wait,
                            )
                        )
                except Exception as exc:  # noqa: BLE001
                    if not job.future.done():
                        job.future.set_exception(exc)
                finally:
                    self._active_workers -= 1
                    job.complete()
            finally:
                self._queue.task_done()


def default_worker_count(cpu_count: int | None = None) -> int:
    """Choose a conservative fixed worker count for CPU-bound HuBERT inference."""
    cpus = max(1, cpu_count if cpu_count is not None else (os.cpu_count() or 1))
    if cpus <= 2:
        return 1
    if cpus <= 4:
        return 2
    if cpus <= 8:
        return 4
    return min(cpus // 2, 8)


def _parse_positive_int(value: str, name: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a positive integer") from exc
    if parsed < 1:
        raise ValueError(f"{name} must be a positive integer")
    return parsed


def resolve_worker_count(
    *,
    explicit: str | None = None,
    legacy: str | None = None,
    cpu_count: int | None = None,
) -> int:
    """Resolve ORACLE_WORKERS, with one-release compatibility for the old knob."""
    if explicit is not None and explicit.strip():
        return _parse_positive_int(explicit.strip(), "ORACLE_WORKERS")
    if legacy is not None and legacy.strip():
        logger.warning(
            "ORACLE_ENCODE_CONCURRENCY is deprecated; use ORACLE_WORKERS instead."
        )
        return _parse_positive_int(legacy.strip(), "ORACLE_ENCODE_CONCURRENCY")
    return default_worker_count(cpu_count)


def resolve_queue_size(value: str | None = None) -> int:
    """Resolve the bounded waiting queue size."""
    if value is None or not value.strip():
        return DEFAULT_MAX_QUEUE_SIZE
    return _parse_positive_int(value.strip(), "ORACLE_MAX_QUEUE_SIZE")


def configure_torch_threads(
    *,
    workers: int,
    cpu_count: int | None = None,
    torch_module: Any | None = None,
) -> tuple[int, int]:
    """Limit per-worker Torch CPU parallelism to avoid core oversubscription."""
    if torch_module is None:
        import torch as torch_module

    cpus = max(1, cpu_count if cpu_count is not None else (os.cpu_count() or 1))
    intra_threads = max(1, cpus // workers)
    torch_module.set_num_threads(intra_threads)
    interop_threads = 1
    try:
        torch_module.set_num_interop_threads(interop_threads)
    except RuntimeError as exc:
        logger.info("Torch inter-op thread count was already configured: %s", exc)
    return intra_threads, interop_threads
