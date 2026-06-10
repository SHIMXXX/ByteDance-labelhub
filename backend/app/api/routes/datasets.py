from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.api.deps import get_demo_user, require_role, success
from app.core.database import get_db
from app.models import DatasetItem, Task
from app.services.access_control import require_owner_dataset
from app.services.dataset_import import (
    import_dataset_from_base64,
    list_dataset_items,
    list_datasets,
    serialize_dataset,
    serialize_dataset_item,
    serialize_import_summary,
)

router = APIRouter(prefix='/datasets', tags=['datasets'])


class DatasetImportRequest(BaseModel):
    name: str
    description: str = ''
    file_name: str
    content_base64: str
    import_mode: str = 'normal'

    @model_validator(mode='before')
    @classmethod
    def normalize_keys(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        if 'file_name' not in normalized and 'fileName' in normalized:
            normalized['file_name'] = normalized['fileName']
        if 'content_base64' not in normalized and 'contentBase64' in normalized:
            normalized['content_base64'] = normalized['contentBase64']
        if 'import_mode' not in normalized and 'importMode' in normalized:
            normalized['import_mode'] = normalized['importMode']
        return normalized


@router.post('/import')
def import_dataset(
    payload: DatasetImportRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    dataset, items, errors = import_dataset_from_base64(
        db,
        owner=user,
        name=payload.name,
        description=payload.description,
        file_name=payload.file_name,
        content_base64=payload.content_base64,
        import_mode=payload.import_mode,
    )
    return success(serialize_import_summary(dataset, items, errors))


@router.get('')
def get_datasets(
    keyword: str | None = None,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1, le=100),
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    result = list_datasets(db, owner_id=user.id, keyword=keyword, page=page, page_size=pageSize)
    return success(
        {
            'items': [serialize_dataset(dataset) for dataset in result.items],
            'total': result.total,
            'page': result.page,
            'pageSize': result.page_size,
        }
    )


@router.get('/{dataset_id}/items')
def get_dataset_items(
    dataset_id: int,
    keyword: str | None = None,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1, le=1000),
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    require_owner_dataset(db, dataset_id, user)
    dataset, result = list_dataset_items(
        db,
        dataset_id=dataset_id,
        keyword=keyword,
        page=page,
        page_size=pageSize,
    )
    return success(
        {
            'dataset': serialize_dataset(dataset),
            'items': [serialize_dataset_item(item) for item in result.items],
            'total': result.total,
            'page': result.page,
            'pageSize': result.page_size,
        }
    )


@router.delete('/{dataset_id}')
def delete_dataset(
    dataset_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    dataset = require_owner_dataset(db, dataset_id, user)
    linked_task = db.query(Task).filter(Task.dataset_id == dataset.id).first()
    if linked_task:
        raise HTTPException(status_code=409, detail='dataset is still linked to a task')

    try:
        # 先删除关联的所有数据集项
        db.query(DatasetItem).filter(DatasetItem.dataset_id == dataset.id).delete()
        db.delete(dataset)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f'Failed to delete dataset: {str(e)}')

    return success({'datasetId': dataset_id})
