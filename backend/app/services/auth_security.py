from datetime import datetime, timedelta, timezone
import hashlib
import hmac

import jwt

from app.core.config import settings


# 中文注释：当前阶段五只提供最小认证基础设施，先满足密码校验与 JWT 签发/解析。
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()



def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    return hmac.compare_digest(hash_password(password), password_hash)



def create_access_token(subject: str, role: str) -> str:
    expire_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({'sub': subject, 'role': role, 'exp': expire_at}, settings.jwt_secret_key, algorithm='HS256')



def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=['HS256'])
