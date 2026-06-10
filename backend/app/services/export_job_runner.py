from app._repo_path import REPO_ROOT  # noqa: F401

from aiagent.services import export_job_runner as _impl

run_export_job = _impl.run_export_job
process_export_job = _impl.process_export_job
SessionLocal = _impl.SessionLocal

_IMPL_ENQUEUE_EXPORT_JOB = _impl.enqueue_export_job
_IMPL_PROCESS_EXPORT_TASK = _impl.process_export_task


def _sync_impl_globals() -> None:
    _impl.SessionLocal = SessionLocal


def enqueue_export_job(job_id: int) -> str:
    _sync_impl_globals()
    return _IMPL_ENQUEUE_EXPORT_JOB(job_id)


def process_export_task(job_id: int) -> None:
    _sync_impl_globals()
    return _IMPL_PROCESS_EXPORT_TASK(job_id)


__all__ = [
    'SessionLocal',
    'enqueue_export_job',
    'process_export_job',
    'process_export_task',
    'run_export_job',
]
