from app._repo_path import REPO_ROOT  # noqa: F401

from aiagent.services import ai_job_runner as _impl

run_ai_audit_job = _impl.run_ai_audit_job
LocalRuleAIExecutor = _impl.LocalRuleAIExecutor
DEFAULT_AI_PASS_THRESHOLD = _impl.DEFAULT_AI_PASS_THRESHOLD
normalize_percent_pass_threshold = _impl.normalize_percent_pass_threshold
safe_format = _impl.safe_format
settings = _impl.settings
write_audit_log = _impl.write_audit_log
get_dataset_item_reference_answer = _impl.get_dataset_item_reference_answer
get_dataset_item_source = _impl.get_dataset_item_source
build_failed_human_review_result = _impl.build_failed_human_review_result
map_execution_result_to_submission_status = _impl.map_execution_result_to_submission_status
persist_ai_audit_result = _impl.persist_ai_audit_result
SessionLocal = _impl.SessionLocal
select_ai_executor = _impl.select_ai_executor

_IMPL_BUILD_EXECUTOR = _impl.build_executor
_IMPL_RENDER_PROMPT = _impl.render_prompt
_IMPL_EXECUTE_AI_AUDIT = _impl.execute_ai_audit
_IMPL_ENQUEUE_AI_AUDIT_JOB = _impl.enqueue_ai_audit_job
_IMPL_PROCESS_AI_AUDIT_JOB = _impl.process_ai_audit_job


def _sync_impl_globals() -> None:
    _impl.SessionLocal = SessionLocal
    _impl.select_ai_executor = select_ai_executor
    _impl.build_executor = build_executor
    _impl.render_prompt = render_prompt
    _impl.execute_ai_audit = execute_ai_audit


def build_executor():
    return _IMPL_BUILD_EXECUTOR()


def render_prompt(snapshot: dict, answers: dict, source: dict | None = None, reference_answer: dict | None = None) -> str:
    return _IMPL_RENDER_PROMPT(snapshot, answers, source, reference_answer)


def execute_ai_audit(executor, submission, snapshot: dict, source: dict | None, reference_answer: dict | None):
    return _IMPL_EXECUTE_AI_AUDIT(executor, submission, snapshot, source, reference_answer)


def enqueue_ai_audit_job(job_id: int) -> str:
    _sync_impl_globals()
    return _IMPL_ENQUEUE_AI_AUDIT_JOB(job_id)


def process_ai_audit_job(job_id: int) -> None:
    _sync_impl_globals()
    return _IMPL_PROCESS_AI_AUDIT_JOB(job_id)


__all__ = [
    'DEFAULT_AI_PASS_THRESHOLD',
    'LocalRuleAIExecutor',
    'SessionLocal',
    'build_executor',
    'build_failed_human_review_result',
    'enqueue_ai_audit_job',
    'execute_ai_audit',
    'get_dataset_item_reference_answer',
    'get_dataset_item_source',
    'map_execution_result_to_submission_status',
    'normalize_percent_pass_threshold',
    'persist_ai_audit_result',
    'process_ai_audit_job',
    'render_prompt',
    'run_ai_audit_job',
    'safe_format',
    'select_ai_executor',
    'settings',
    'write_audit_log',
]
