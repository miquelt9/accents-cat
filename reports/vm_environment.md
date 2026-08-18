# VM environment

Recorded during the 2026-08-17 investigation.

| Resource | Observed value |
| --- | --- |
| CPU | 6 logical CPUs, Intel Xeon Processor @ 2.50 GHz |
| RAM | 3.8 GiB total; approximately 1.2 GiB available at inspection |
| Disk | 32 GiB available on `/home/ubuntu` |
| GPU | None detected; `nvidia-smi` unavailable |
| Python | 3.12 runtime used by the shell command |
| PyTorch | Not installed at inspection |
| Transformers | Not installed at inspection |
| Node/npm | Existing web toolchain available; website checks completed |
| ffmpeg | Not measured in this run |

Scikit-learn and joblib were installed during the investigation so the canonical baseline could reach its data-loading stage. No large speech model or dataset was downloaded because the canonical 79–85 GiB archive exceeds the available disk space and no smaller canonical bundle was found locally or in the documented public remotes.
