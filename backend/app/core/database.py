from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


database_url = (
    f'mysql+pymysql://{settings.mysql_user}:{settings.mysql_password}'
    f'@{settings.mysql_host}:{settings.mysql_port}/{settings.mysql_database}'
)

engine = create_engine(database_url, echo=False, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def patch_schema() -> None:
    from app import models

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    if 'ai_audit_configs' not in table_names:
        Base.metadata.tables['ai_audit_configs'].create(bind=engine)
        table_names.add('ai_audit_configs')

    if 'submission_versions' not in table_names:
        Base.metadata.tables['submission_versions'].create(bind=engine)
        table_names.add('submission_versions')

    if 'task_reviewer_assignments' not in table_names:
        Base.metadata.tables['task_reviewer_assignments'].create(bind=engine)
        table_names.add('task_reviewer_assignments')

    if 'task_reviewer_assignments' in table_names:
        reviewer_assignment_indexes = {
            index['name'] for index in inspect(engine).get_indexes('task_reviewer_assignments')
        }
        if 'uq_task_reviewer_assignment' not in reviewer_assignment_indexes:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        'CREATE UNIQUE INDEX uq_task_reviewer_assignment '
                        'ON task_reviewer_assignments (task_id, reviewer_id)'
                    )
                )

    if 'datasets' in table_names:
        dataset_columns = {column['name'] for column in inspector.get_columns('datasets')}
        dataset_statements: list[str] = []
        if 'import_mode' not in dataset_columns:
            dataset_statements.append("ALTER TABLE datasets ADD COLUMN import_mode VARCHAR(32) NOT NULL DEFAULT 'normal'")

        if dataset_statements:
            with engine.begin() as connection:
                for statement in dataset_statements:
                    connection.execute(text(statement))

    if 'dataset_items' in table_names:
        dataset_item_columns = {column['name'] for column in inspector.get_columns('dataset_items')}
        dataset_item_statements: list[str] = []
        if 'metadata_json' not in dataset_item_columns:
            dataset_item_statements.append('ALTER TABLE dataset_items ADD COLUMN metadata_json JSON NULL')
        if 'reference_answer_json' not in dataset_item_columns:
            dataset_item_statements.append('ALTER TABLE dataset_items ADD COLUMN reference_answer_json JSON NULL')

        if dataset_item_statements:
            with engine.begin() as connection:
                for statement in dataset_item_statements:
                    connection.execute(text(statement))

    if 'tasks' in table_names:
        task_columns = {column['name'] for column in inspector.get_columns('tasks')}
        statements: list[str] = []

        if 'active_template_id' not in task_columns:
            statements.append('ALTER TABLE tasks ADD COLUMN active_template_id INT NULL')
        if 'active_template_version_id' not in task_columns:
            statements.append('ALTER TABLE tasks ADD COLUMN active_template_version_id INT NULL')
        if 'dataset_id' not in task_columns:
            statements.append('ALTER TABLE tasks ADD COLUMN dataset_id INT NULL')
        if 'ai_prompt_template' not in task_columns:
            statements.append('ALTER TABLE tasks ADD COLUMN ai_prompt_template TEXT NULL')
        if 'ai_score_dimensions_json' not in task_columns:
            statements.append('ALTER TABLE tasks ADD COLUMN ai_score_dimensions_json JSON NULL')
        if 'ai_pass_threshold' not in task_columns:
            statements.append('ALTER TABLE tasks ADD COLUMN ai_pass_threshold INT NULL')
        if 'review_guideline' not in task_columns:
            statements.append('ALTER TABLE tasks ADD COLUMN review_guideline TEXT NULL')
        if 'task_brief' not in task_columns:
            statements.append('ALTER TABLE tasks ADD COLUMN task_brief TEXT NULL')
        if 'task_tags_json' not in task_columns:
            statements.append('ALTER TABLE tasks ADD COLUMN task_tags_json JSON NULL')
        if 'reward_rule' not in task_columns:
            statements.append('ALTER TABLE tasks ADD COLUMN reward_rule TEXT NULL')

        if statements:
            with engine.begin() as connection:
                for statement in statements:
                    connection.execute(text(statement))

    if 'templates' in table_names:
        template_columns = {column['name'] for column in inspector.get_columns('templates')}
        template_statements: list[str] = []
        if 'design_dataset_id' not in template_columns:
            template_statements.append('ALTER TABLE templates ADD COLUMN design_dataset_id INT NULL')
        if 'design_sample_item_id' not in template_columns:
            template_statements.append('ALTER TABLE templates ADD COLUMN design_sample_item_id INT NULL')

        if template_statements:
            with engine.begin() as connection:
                for statement in template_statements:
                    connection.execute(text(statement))

    if 'users' in table_names:
        user_columns = {column['name'] for column in inspector.get_columns('users')}
        user_statements: list[str] = []
        if 'password_hash' not in user_columns:
            user_statements.append('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL')

        if user_statements:
            with engine.begin() as connection:
                for statement in user_statements:
                    connection.execute(text(statement))

    if 'assignments' in table_names:
        assignment_columns = {column['name'] for column in inspector.get_columns('assignments')}
        statements = []

        if 'progress_total' not in assignment_columns:
            statements.append('ALTER TABLE assignments ADD COLUMN progress_total INT NOT NULL DEFAULT 0')
        if 'progress_completed' not in assignment_columns:
            statements.append('ALTER TABLE assignments ADD COLUMN progress_completed INT NOT NULL DEFAULT 0')

        if statements:
            with engine.begin() as connection:
                for statement in statements:
                    connection.execute(text(statement))

    if 'submissions' in table_names:
        submission_columns = {column['name'] for column in inspector.get_columns('submissions')}
        submission_indexes = {index['name']: index for index in inspector.get_indexes('submissions')}
        statements = []

        if 'dataset_item_id' not in submission_columns:
            statements.append('ALTER TABLE submissions ADD COLUMN dataset_item_id INT NULL')
        if 'final_answer_json' not in submission_columns:
            statements.append('ALTER TABLE submissions ADD COLUMN final_answer_json JSON NULL')
        if 'current_version_no' not in submission_columns:
            statements.append('ALTER TABLE submissions ADD COLUMN current_version_no INT NOT NULL DEFAULT 0')
        if 'current_review_stage' not in submission_columns:
            statements.append("ALTER TABLE submissions ADD COLUMN current_review_stage VARCHAR(16) NOT NULL DEFAULT 'initial'")
        if 'current_review_round' not in submission_columns:
            statements.append('ALTER TABLE submissions ADD COLUMN current_review_round INT NOT NULL DEFAULT 1')
        if 'assigned_reviewer_id' not in submission_columns:
            statements.append('ALTER TABLE submissions ADD COLUMN assigned_reviewer_id INT NULL')
        if 'finalized_by' not in submission_columns:
            statements.append('ALTER TABLE submissions ADD COLUMN finalized_by INT NULL')
        if 'finalized_at' not in submission_columns:
            statements.append('ALTER TABLE submissions ADD COLUMN finalized_at DATETIME NULL')
        if 'final_submission_version_no' not in submission_columns:
            statements.append('ALTER TABLE submissions ADD COLUMN final_submission_version_no INT NULL')

        if 'uq_submission_assignment_item' not in submission_indexes:
            statements.append('CREATE UNIQUE INDEX uq_submission_assignment_item ON submissions (assignment_id, dataset_item_id)')
        if 'uq_submission_assignment' in submission_indexes:
            if engine.dialect.name == 'sqlite':
                statements.append('DROP INDEX uq_submission_assignment')
            else:
                statements.append('DROP INDEX uq_submission_assignment ON submissions')

        if statements:
            with engine.begin() as connection:
                for statement in statements:
                    connection.execute(text(statement))

    if 'review_records' in table_names:
        review_columns = {column['name'] for column in inspector.get_columns('review_records')}
        review_statements = []

        if 'submission_version_id' not in review_columns:
            review_statements.append('ALTER TABLE review_records ADD COLUMN submission_version_id INT NULL')
        if 'review_stage' not in review_columns:
            review_statements.append("ALTER TABLE review_records ADD COLUMN review_stage VARCHAR(16) NOT NULL DEFAULT 'initial'")
        if 'review_round' not in review_columns:
            review_statements.append('ALTER TABLE review_records ADD COLUMN review_round INT NOT NULL DEFAULT 1')
        if 'assignee_reviewer_id' not in review_columns:
            review_statements.append('ALTER TABLE review_records ADD COLUMN assignee_reviewer_id INT NULL')

        if review_statements:
            with engine.begin() as connection:
                for statement in review_statements:
                    connection.execute(text(statement))

    if 'ai_audit_jobs' in table_names:
        job_columns = {column['name'] for column in inspector.get_columns('ai_audit_jobs')}
        job_statements = []

        if 'celery_task_id' not in job_columns:
            job_statements.append('ALTER TABLE ai_audit_jobs ADD COLUMN celery_task_id VARCHAR(128) NULL')
        if 'config_snapshot_json' not in job_columns:
            job_statements.append('ALTER TABLE ai_audit_jobs ADD COLUMN config_snapshot_json JSON NULL')
        if 'prompt_snapshot' not in job_columns:
            job_statements.append('ALTER TABLE ai_audit_jobs ADD COLUMN prompt_snapshot TEXT NULL')
        if 'raw_response' not in job_columns:
            job_statements.append('ALTER TABLE ai_audit_jobs ADD COLUMN raw_response TEXT NULL')
        if 'error_code' not in job_columns:
            job_statements.append('ALTER TABLE ai_audit_jobs ADD COLUMN error_code VARCHAR(64) NULL')

        if job_statements:
            with engine.begin() as connection:
                for statement in job_statements:
                    connection.execute(text(statement))

    if 'ai_audit_results' in table_names:
        result_columns = {column['name'] for column in inspector.get_columns('ai_audit_results')}
        result_statements = []

        if 'prompt_snapshot' not in result_columns:
            result_statements.append('ALTER TABLE ai_audit_results ADD COLUMN prompt_snapshot TEXT NULL')
        if 'raw_response' not in result_columns:
            result_statements.append('ALTER TABLE ai_audit_results ADD COLUMN raw_response TEXT NULL')
        if 'validation_status' not in result_columns:
            result_statements.append("ALTER TABLE ai_audit_results ADD COLUMN validation_status VARCHAR(32) NOT NULL DEFAULT 'valid'")
        if 'config_version' not in result_columns:
            result_statements.append('ALTER TABLE ai_audit_results ADD COLUMN config_version INT NOT NULL DEFAULT 1')
        if 'overall_score' not in result_columns:
            result_statements.append('ALTER TABLE ai_audit_results ADD COLUMN overall_score INT NOT NULL DEFAULT 0')

        if result_statements:
            with engine.begin() as connection:
                for statement in result_statements:
                    connection.execute(text(statement))

    if 'ai_audit_configs' in table_names:
        config_columns = {column['name'] for column in inspector.get_columns('ai_audit_configs')}
        config_statements = []
        if 'ai_model' not in config_columns:
            config_statements.append("ALTER TABLE ai_audit_configs ADD COLUMN ai_model VARCHAR(64) NOT NULL DEFAULT 'qwen3.6-flash'")
        
        if config_statements:
            with engine.begin() as connection:
                for statement in config_statements:
                    connection.execute(text(statement))

    if 'export_jobs' in table_names:
        export_columns = {column['name'] for column in inspector.get_columns('export_jobs')}
        export_statements = []

        if 'field_mapping_json' not in export_columns:
            export_statements.append('ALTER TABLE export_jobs ADD COLUMN field_mapping_json JSON NULL')
        if 'include_ai_audit' not in export_columns:
            export_statements.append('ALTER TABLE export_jobs ADD COLUMN include_ai_audit BOOLEAN NOT NULL DEFAULT FALSE')
        if 'include_review_records' not in export_columns:
            export_statements.append('ALTER TABLE export_jobs ADD COLUMN include_review_records BOOLEAN NOT NULL DEFAULT FALSE')
        if 'export_scope' not in export_columns:
            export_statements.append("ALTER TABLE export_jobs ADD COLUMN export_scope VARCHAR(32) NOT NULL DEFAULT 'all'")

        if export_statements:
            with engine.begin() as connection:
                for statement in export_statements:
                    connection.execute(text(statement))


def init_db() -> None:
    from app import models

    Base.metadata.create_all(bind=engine)
    patch_schema()


def seed_demo_users(db: Session) -> None:
    from app.models import User
    from app.services.auth_security import hash_password

    demo_users = [
        ('owner_demo', 'Owner Demo', 'owner', 'owner-demo-password'),
        ('labeler_demo', 'Labeler Demo', 'labeler', 'labeler-demo-password'),
        ('labeler_demo2', 'Labeler Demo2', 'labeler', 'labeler-demo2-password'),
        ('reviewer_demo', 'Reviewer Demo', 'reviewer', 'reviewer-demo-password'),
        ('reviewer_demo2', 'Reviewer Demo2', 'reviewer', 'reviewer-demo2-password'),
    ]

    existing_users = {
        user.username: user
        for user in db.query(User).filter(User.username.in_([item[0] for item in demo_users])).all()
    }

    for username, display_name, role, password in demo_users:
        existing_user = existing_users.get(username)
        if not existing_user:
            db.add(
                User(
                    username=username,
                    display_name=display_name,
                    role=role,
                    password_hash=hash_password(password),
                )
            )
            continue

        if existing_user.password_hash is None:
            existing_user.password_hash = hash_password(password)

    db.commit()
