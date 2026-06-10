from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_demo_user, require_role, success
from app.core.database import get_db
from app.models import Dataset, DatasetItem, Task, Template, TemplateVersion
from app.services.access_control import require_owner_task, require_owner_template

router = APIRouter(prefix='/templates', tags=['templates'])


class TemplateCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    description: str = ''
    task_id: int | None = Field(default=None, alias='taskId')
    dataset_id: int | None = Field(default=None, alias='datasetId')


class TemplateUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    description: str = ''
    dataset_id: int | None = Field(default=None, alias='datasetId')
    sample_item_id: int | None = Field(default=None, alias='sampleItemId')


class TemplateVersionCreateRequest(BaseModel):
    schema_: dict = Field(alias='schema')



def latest_template_version(db: Session, template_id: int) -> TemplateVersion | None:
    return (
        db.query(TemplateVersion)
        .filter(TemplateVersion.template_id == template_id)
        .order_by(TemplateVersion.version.desc())
        .first()
    )



def build_template_asset_row(db: Session, template: Template) -> dict:
    latest_version = latest_template_version(db, template.id)
    task_usage_count = db.query(func.count(Task.id)).filter(Task.active_template_id == template.id).scalar() or 0
    return {
        'id': template.id,
        'name': template.name,
        'description': template.description,
        'latestVersion': latest_version.version if latest_version else 0,
        'latestTemplateVersionId': latest_version.id if latest_version else None,
        'taskUsageCount': task_usage_count,
        'updatedAt': latest_version.created_at if latest_version else template.created_at,
        'datasetId': template.design_dataset_id,
        'sampleItemId': template.design_sample_item_id,
    }


ALLOWED_COMPONENT_TYPES = {
    'text_input',
    'textarea',
    'single_select',
    'multi_select',
    'tag_select',
    'image_upload',
    'show_item',
    'compare_panel',
    'rich_text',
    'json_editor',
    'llm_assist',
    'group',
    'tab_container',
    'field_display',
    'field_textarea',
    'field_tags',
    'field_hyperlink',
    'field_image',
    'field_video',
    'field_markdown',
}

BASE_KEYS = {'type', 'label', 'field', 'required', 'visibleWhen', 'validationRules'}
OPTION_KEYS = BASE_KEYS | {'options'}
IMAGE_KEYS = BASE_KEYS | {'maxCount'}
SHOW_ITEM_KEYS = {'type', 'label', 'field', 'content'}
COMPARE_PANEL_KEYS = {
    'type',
    'label',
    'field',
    'content',
    'promptField',
    'leftField',
    'rightField',
    'leftLabel',
    'rightLabel',
    'metadataFields',
    'contextFields',
    'children_left',
    'children_right',
}
RICH_TEXT_KEYS = BASE_KEYS | {'content'}
LLM_ASSIST_KEYS = RICH_TEXT_KEYS | {'llmInstruction'}
FIELD_DISPLAY_KEYS = {'type', 'label', 'field', 'sourceField', 'visibleWhen'}
FIELD_TEXTAREA_KEYS = {'type', 'label', 'field', 'sourceField', 'visibleWhen'}
FIELD_TAGS_KEYS = {'type', 'label', 'field', 'sourceField', 'visibleWhen'}
FIELD_HYPERLINK_KEYS = {'type', 'label', 'field', 'sourceField', 'visibleWhen'}
FIELD_IMAGE_KEYS = {'type', 'label', 'field', 'sourceField', 'visibleWhen'}
FIELD_VIDEO_KEYS = {'type', 'label', 'field', 'sourceField', 'visibleWhen'}
FIELD_MARKDOWN_KEYS = {'type', 'label', 'field', 'sourceField', 'visibleWhen'}
GROUP_KEYS = {'type', 'label', 'description', 'children'}
TAB_CONTAINER_KEYS = {'type', 'label', 'tabs'}


def validate_field_component(component: dict, seen_fields: set[str]) -> None:
    field = component.get('field')
    if component.get('type') != 'show_item' and isinstance(field, str) and field.strip():
        normalized_field = field.strip()
        if normalized_field in seen_fields:
            raise HTTPException(status_code=400, detail=f'duplicate field: {normalized_field}')
        seen_fields.add(normalized_field)



def validate_rule_list(component: dict) -> None:
    visible_when = component.get('visibleWhen', [])
    if visible_when is None:
        visible_when = []
    for rule in visible_when:
        if rule.get('operator') not in {'eq', 'neq', 'not_empty', 'includes'}:
            raise HTTPException(status_code=400, detail='invalid visibleWhen operator')

    validation_rules = component.get('validationRules', [])
    if validation_rules is None:
        validation_rules = []
    for rule in validation_rules:
        if rule.get('type') not in {'required_if', 'min_selected', 'json_valid', 'min_length', 'equals_if', 'not_equals_if'}:
            raise HTTPException(status_code=400, detail='invalid validation rule type')



def validate_component_tree(components: list[dict], seen_fields: set[str]) -> None:
    for component in components:
        if not isinstance(component, dict):
            raise HTTPException(status_code=400, detail='component must be an object')

        component_type = component.get('type')
        if component_type not in ALLOWED_COMPONENT_TYPES:
            raise HTTPException(status_code=400, detail='invalid component type')

        if component_type == 'group':
            extra_keys = set(component.keys()) - GROUP_KEYS
            if extra_keys:
                raise HTTPException(status_code=400, detail=f'unsupported component fields: {sorted(extra_keys)}')
            children = component.get('children', [])
            if not isinstance(children, list):
                raise HTTPException(status_code=400, detail='group.children must be a list')
            validate_component_tree(children, seen_fields)
            continue

        if component_type == 'tab_container':
            extra_keys = set(component.keys()) - TAB_CONTAINER_KEYS
            if extra_keys:
                raise HTTPException(status_code=400, detail=f'unsupported component fields: {sorted(extra_keys)}')
            tabs = component.get('tabs', [])
            if not isinstance(tabs, list):
                raise HTTPException(status_code=400, detail='tab_container.tabs must be a list')
            for tab in tabs:
                if not isinstance(tab, dict):
                    raise HTTPException(status_code=400, detail='tab must be an object')
                children = tab.get('children', [])
                if not isinstance(children, list):
                    raise HTTPException(status_code=400, detail='tab.children must be a list')
                validate_component_tree(children, seen_fields)
            continue

        allowed_keys = BASE_KEYS
        if component_type in {'single_select', 'multi_select', 'tag_select'}:
            allowed_keys = OPTION_KEYS
        elif component_type == 'image_upload':
            allowed_keys = IMAGE_KEYS
        elif component_type == 'show_item':
            allowed_keys = SHOW_ITEM_KEYS
        elif component_type == 'compare_panel':
            allowed_keys = COMPARE_PANEL_KEYS
        elif component_type == 'llm_assist':
            allowed_keys = LLM_ASSIST_KEYS
        elif component_type in {'rich_text', 'json_editor'}:
            allowed_keys = RICH_TEXT_KEYS
        elif component_type in {'field_display', 'field_textarea', 'field_tags', 'field_hyperlink', 'field_image', 'field_video', 'field_markdown'}:
            allowed_keys = FIELD_DISPLAY_KEYS

        extra_keys = set(component.keys()) - allowed_keys
        if extra_keys:
            raise HTTPException(status_code=400, detail=f'unsupported component fields: {sorted(extra_keys)}')

        if component_type == 'compare_panel':
            for child_key in ('children_left', 'children_right'):
                children = component.get(child_key, [])
                if children is None:
                    children = []
                if not isinstance(children, list):
                    raise HTTPException(status_code=400, detail=f'compare_panel.{child_key} must be a list')
                validate_component_tree(children, seen_fields)

        validate_rule_list(component)
        validate_field_component(component, seen_fields)



def validate_template_schema(schema: dict) -> None:
    version = schema.get('version', 1)

    if version == 3:
        dataset_binding = schema.get('datasetBinding')
        layout = schema.get('layout')
        source_view = schema.get('sourceView')
        answer_view = schema.get('answerView')

        if not isinstance(dataset_binding, dict):
            raise HTTPException(status_code=400, detail='schema.datasetBinding must be an object')
        if not isinstance(layout, dict) or layout.get('type') != 'stacked-source-answer':
            raise HTTPException(status_code=400, detail='schema.layout.type must be stacked-source-answer')
        if not isinstance(source_view, dict) or not isinstance(source_view.get('components'), list):
            raise HTTPException(status_code=400, detail='schema.sourceView.components must be a list')
        if not isinstance(answer_view, dict) or not isinstance(answer_view.get('components'), list):
            raise HTTPException(status_code=400, detail='schema.answerView.components must be a list')

        seen_fields: set[str] = set()
        validate_component_tree(source_view['components'], seen_fields)
        validate_component_tree(answer_view['components'], seen_fields)
        return

    components = schema.get('components')
    if not isinstance(components, list):
        raise HTTPException(status_code=400, detail='schema.components must be a list')

    seen_fields: set[str] = set()
    validate_component_tree(components, seen_fields)


@router.get('')
def list_templates(
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})
    templates = db.query(Template).filter(Template.created_by == user.id).order_by(Template.created_at.desc()).all()
    return success({'items': [build_template_asset_row(db, template) for template in templates]})


@router.post('')
def create_template(
    payload: TemplateCreateRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    if payload.task_id:
        require_owner_task(db, payload.task_id, user)

    dataset = None
    first_item = None
    if payload.dataset_id is not None:
        dataset = db.get(Dataset, payload.dataset_id)
        if dataset is None or dataset.created_by != user.id:
            raise HTTPException(status_code=403, detail='dataset is not accessible')

        first_item = (
            db.query(DatasetItem)
            .filter(DatasetItem.dataset_id == dataset.id)
            .order_by(DatasetItem.item_index.asc())
            .first()
        )

    template = Template(
        task_id=payload.task_id,
        design_dataset_id=dataset.id if dataset else None,
        design_sample_item_id=first_item.id if first_item else None,
        name=payload.name,
        description=payload.description,
        created_by=user.id,
    )
    db.add(template)
    db.flush()

    if payload.task_id:
        task = db.get(Task, payload.task_id)
        if task:
            task.active_template_id = template.id

    db.commit()
    db.refresh(template)

    return success(
        {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'datasetId': template.design_dataset_id,
            'sampleItemId': template.design_sample_item_id,
        }
    )


@router.patch('/{template_id}')
def update_template(
    template_id: int,
    payload: TemplateUpdateRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    template = require_owner_template(db, template_id, user)

    # Update basic fields
    template.name = payload.name
    template.description = payload.description

    # Handle dataset and sample item binding
    # We check the dump to see what was actually sent
    body_data = payload.model_dump(exclude_unset=True, by_alias=True)

    # Check both alias and field name for robustness
    has_dataset_id = 'datasetId' in body_data or 'dataset_id' in body_data
    if has_dataset_id:
        ds_id = body_data['datasetId'] if 'datasetId' in body_data else body_data.get('dataset_id')
        if ds_id is None or ds_id == 0:
            template.design_dataset_id = None
            template.design_sample_item_id = None
        else:
            dataset = db.get(Dataset, ds_id)
            if dataset is None:
                raise HTTPException(status_code=404, detail='dataset not found')
            if dataset.created_by != user.id:
                raise HTTPException(status_code=403, detail='dataset belongs to another owner')

            template.design_dataset_id = dataset.id

            # Auto-pick first item if sample not explicitly provided in this request
            if 'sampleItemId' not in body_data and 'sample_item_id' not in body_data:
                first_item = (
                    db.query(DatasetItem)
                    .filter(DatasetItem.dataset_id == dataset.id)
                    .order_by(DatasetItem.item_index.asc())
                    .first()
                )
                template.design_sample_item_id = first_item.id if first_item else None

    # Handle explicit sample item update
    has_sample_item_id = 'sampleItemId' in body_data or 'sample_item_id' in body_data
    if has_sample_item_id:
        item_id = body_data.get('sampleItemId') or body_data.get('sample_item_id')
        if item_id is None or item_id == 0:
            template.design_sample_item_id = None
        else:
            item = db.get(DatasetItem, item_id)
            if item and item.dataset_id == template.design_dataset_id:
                template.design_sample_item_id = item.id

    db.commit()
    db.refresh(template)

    return success({
        'id': template.id,
        'name': template.name,
        'description': template.description,
        'datasetId': template.design_dataset_id,
        'sampleItemId': template.design_sample_item_id
    })


@router.delete('/{template_id}')
def delete_template(
    template_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    template = require_owner_template(db, template_id, user)
    linked_task = db.query(Task).filter(Task.active_template_id == template.id).first()
    if linked_task:
        raise HTTPException(status_code=409, detail='template is still linked to a task')

    try:
        db.query(TemplateVersion).filter(TemplateVersion.template_id == template.id).delete()
        db.delete(template)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f'Failed to delete template: {str(e)}')

    return success({'templateId': template_id})


@router.post('/{template_id}/duplicate')
def duplicate_template(
    template_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    source_template = require_owner_template(db, template_id, user)
    duplicated_template = Template(
        name=f'{source_template.name}（副本）',
        description=source_template.description,
        created_by=user.id,
        design_dataset_id=source_template.design_dataset_id,
        design_sample_item_id=source_template.design_sample_item_id,
    )
    db.add(duplicated_template)
    db.flush()

    latest_version = latest_template_version(db, source_template.id)
    if latest_version:
        db.add(
            TemplateVersion(
                template_id=duplicated_template.id,
                version=1,
                schema_json=latest_version.schema_json,
            )
        )

    db.commit()
    db.refresh(duplicated_template)

    return success(build_template_asset_row(db, duplicated_template))


@router.post('/{template_id}/versions')
def create_template_version(
    template_id: int,
    payload: TemplateVersionCreateRequest,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    template = require_owner_template(db, template_id, user)

    validate_template_schema(payload.schema_)

    latest = latest_template_version(db, template_id)
    next_version = latest.version + 1 if latest else 1
    version = TemplateVersion(template_id=template_id, version=next_version, schema_json=payload.schema_)
    db.add(version)
    db.commit()
    db.refresh(version)

    return success(
        {
            'templateVersionId': version.id,
            'templateId': version.template_id,
            'version': version.version,
        }
    )


@router.get('/{template_id}/active-version')
def get_active_template_version(
    template_id: int,
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user = get_demo_user(db, authorization, x_demo_user)
    require_role(user, {'owner'})

    template = require_owner_template(db, template_id, user)

    version = (
        db.query(TemplateVersion)
        .filter(TemplateVersion.template_id == template_id)
        .order_by(TemplateVersion.version.desc())
        .first()
    )
    if not version:
        return success(
            {
                'templateId': template.id,
                'templateVersionId': None,
                'datasetBinding': {
                    'datasetId': template.design_dataset_id,
                    'sampleItemId': template.design_sample_item_id,
                    'sampleStrategy': 'first_item',
                },
                'schema': {
                    'version': 3,
                    'datasetBinding': {
                        'datasetId': template.design_dataset_id,
                        'sampleItemId': template.design_sample_item_id,
                        'sampleStrategy': 'first_item',
                    },
                    'layout': {'type': 'stacked-source-answer'},
                    'sourceView': {'components': []},
                    'answerView': {'components': []},
                },
            }
        )

    return success(
        {
            'templateId': template.id,
            'templateVersionId': version.id,
            'datasetBinding': {
                'datasetId': template.design_dataset_id,
                'sampleItemId': template.design_sample_item_id,
                'sampleStrategy': 'first_item',
            },
            'schema': version.schema_json,
        }
    )
