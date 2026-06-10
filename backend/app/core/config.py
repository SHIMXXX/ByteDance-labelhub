from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = 'LabelHub API'
    app_env: str = 'development'
    api_prefix: str = '/api/v1'
    # 保持本地默认值，但运行方式必须允许通过环境变量覆盖，避免部署口径只适配本机。
    mysql_host: str = 'db-host'
    mysql_port: int = 3306
    mysql_user: str = 'db-user'
    mysql_password: str = 'change-me'
    mysql_database: str = 'labelhub'

    jwt_secret_key: str = 'change-me-jwt-secret'
    jwt_expire_minutes: int = 120

    ai_provider: str = 'qwen'
    ai_timeout_seconds: int = 90
    ai_max_attempts: int = 2
    deepseek_api_key: str | None = None
    deepseek_model: str = 'deepseek-v4-flash'
    deepseek_base_url: str = 'https://api.deepseek.com'
    qwen_api_key: str | None = None
    qwen_model: str = 'qwen3.6-flash'
    qwen_base_url: str | None = None
    redis_url: str = 'redis://redis-host:6379/0'
    celery_task_always_eager: bool = False
    ai_run_jobs_inline: bool = False

    @field_validator(
        'ai_provider',
        'deepseek_api_key',
        'deepseek_model',
        'deepseek_base_url',
        'qwen_api_key',
        'qwen_model',
        'qwen_base_url',
        'redis_url',
        mode='before',
    )
    @classmethod
    def strip_string_values(cls, value: str | None):
        if isinstance(value, str):
            return value.strip()
        return value

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parent.parent.parent / '.env'),
        env_file_encoding='utf-8',
        extra='ignore',
    )


settings = Settings()
