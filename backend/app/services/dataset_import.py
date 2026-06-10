import base64
import io
import json
import zipfile
from dataclasses import dataclass
from xml.etree import ElementTree

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Dataset, DatasetItem, User
from app.schemas.dataset import DatasetImportItem, DatasetImportParseResult


DISPLAY_FIELDS = {
    'prompt',
    'response_a',
    'response_b',
    'question',
    'context',
    'instruction',
    'input',
}
METADATA_FIELDS = {
    'id',
    'category',
    'source',
    'model_a',
    'model_b',
    'model',
    'sample_id',
}
REFERENCE_FIELDS = {
    'preferred',
    'preferred_answer',
    'margin',
    'dimensions',
    'safety_flag',
    'annotator_note',
    'rationale',
}
IMPORT_MODES = {'normal', 'gold_sample', 'demo'}


class DatasetImportError(ValueError):
    pass


@dataclass
class PageResult:
    items: list
    total: int
    page: int
    page_size: int


def classify_dataset_row(row: dict) -> DatasetImportItem:
    source: dict = {}
    metadata: dict = {}
    reference_answer: dict = {}

    for key, value in row.items():
        normalized_key = str(key).strip()
        lowered_key = normalized_key.lower()
        if not normalized_key:
            continue

        if lowered_key in DISPLAY_FIELDS:
            source[normalized_key] = value
            continue
        if lowered_key in REFERENCE_FIELDS or lowered_key.startswith('gold_') or lowered_key.startswith('demo_'):
            reference_answer[normalized_key] = value
            continue
        if lowered_key in METADATA_FIELDS or lowered_key.startswith('meta'):
            metadata[normalized_key] = value
            continue
        source[normalized_key] = value

    return DatasetImportItem(
        source=source,
        metadata=metadata,
        reference_answer=reference_answer,
    )


def build_dataset_search_text(item: DatasetImportItem) -> str:
    return json.dumps(
        {
            'source': item.source,
            'metadata': item.metadata,
        },
        ensure_ascii=False,
    )


def parse_dataset_payload(payload: str, source_format: str) -> DatasetImportParseResult:
    normalized_format = source_format.lower().strip()
    if normalized_format == 'json':
        return _parse_json_payload(payload)
    if normalized_format == 'jsonl':
        return _parse_jsonl_payload(payload)
    raise DatasetImportError(f'unsupported dataset import format: {source_format}')


def import_dataset_from_base64(
    db: Session,
    owner: User,
    name: str,
    description: str,
    file_name: str,
    content_base64: str,
    import_mode: str = 'normal',
) -> tuple[Dataset, list[DatasetItem], list[str]]:
    source_type = _detect_source_type(file_name)
    normalized_import_mode = import_mode.lower().strip()
    if normalized_import_mode not in IMPORT_MODES:
        raise HTTPException(status_code=400, detail=f'unsupported import mode: {import_mode}')

    raw_bytes = _decode_base64(content_base64)

    errors: list[str] = []
    try:
        if source_type == 'excel':
            parsed = _parse_excel_bytes(raw_bytes)
        else:
            try:
                text = raw_bytes.decode('utf-8')
            except UnicodeDecodeError as exc:
                raise HTTPException(status_code=400, detail='dataset text payload must be utf-8 encoded') from exc
            parsed = parse_dataset_payload(text, source_type)
    except DatasetImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail='invalid dataset json payload') from exc

    if not parsed.items:
        raise HTTPException(status_code=400, detail='dataset import produced no items')

    dataset = Dataset(
        created_by=owner.id,
        name=name,
        description=description,
        source_type=source_type,
        import_mode=normalized_import_mode,
        item_count=len(parsed.items),
    )
    db.add(dataset)
    db.flush()

    items: list[DatasetItem] = []
    for index, item in enumerate(parsed.items):
        search_text = build_dataset_search_text(item)
        dataset_item = DatasetItem(
            dataset_id=dataset.id,
            item_index=index + 1,
            source_json=item.source,
            metadata_json=item.metadata,
            reference_answer_json=item.reference_answer,
            search_text=search_text,
        )
        db.add(dataset_item)
        items.append(dataset_item)

    db.commit()
    for item in items:
        db.refresh(item)
    db.refresh(dataset)
    return dataset, items, errors


def list_datasets(
    db: Session,
    owner_id: int | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 10,
) -> PageResult:
    statement = select(Dataset).order_by(Dataset.id.desc())
    count_statement = select(func.count()).select_from(Dataset)
    if owner_id is not None:
        statement = statement.where(Dataset.created_by == owner_id)
        count_statement = count_statement.where(Dataset.created_by == owner_id)
    if keyword:
        like = f'%{keyword}%'
        statement = statement.where(Dataset.name.ilike(like))
        count_statement = count_statement.where(Dataset.name.ilike(like))

    total = db.scalar(count_statement) or 0
    items = list(db.scalars(statement.offset((page - 1) * page_size).limit(page_size)))
    return PageResult(items=items, total=total, page=page, page_size=page_size)


def list_dataset_items(
    db: Session,
    dataset_id: int,
    keyword: str | None,
    page: int,
    page_size: int,
) -> tuple[Dataset, PageResult]:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail='dataset not found')

    statement = select(DatasetItem).where(DatasetItem.dataset_id == dataset_id).order_by(DatasetItem.item_index.asc())
    count_statement = select(func.count()).select_from(DatasetItem).where(DatasetItem.dataset_id == dataset_id)
    if keyword:
        like = f'%{keyword}%'
        statement = statement.where(DatasetItem.search_text.ilike(like))
        count_statement = count_statement.where(DatasetItem.search_text.ilike(like))

    total = db.scalar(count_statement) or 0
    items = list(db.scalars(statement.offset((page - 1) * page_size).limit(page_size)))
    return dataset, PageResult(items=items, total=total, page=page, page_size=page_size)


def serialize_dataset(dataset: Dataset) -> dict:
    return {
        'id': dataset.id,
        'name': dataset.name,
        'description': dataset.description,
        'sourceType': dataset.source_type,
        'importMode': dataset.import_mode,
        'itemCount': dataset.item_count,
        'createdAt': dataset.created_at,
        'updatedAt': dataset.updated_at,
    }


def get_dataset_item_source(item: DatasetItem | None) -> dict:
    if item is None or not isinstance(item.source_json, dict):
        return {}
    return item.source_json


def get_dataset_item_metadata(item: DatasetItem | None) -> dict:
    if item is None or not isinstance(item.metadata_json, dict):
        return {}
    return item.metadata_json


def get_dataset_item_reference_answer(item: DatasetItem | None) -> dict:
    if item is None or not isinstance(item.reference_answer_json, dict):
        return {}
    return item.reference_answer_json


def get_dataset_item_context(item: DatasetItem | None) -> dict:
    return {
        **get_dataset_item_source(item),
        **get_dataset_item_metadata(item),
    }


def serialize_dataset_item(item: DatasetItem) -> dict:
    return {
        'id': item.id,
        'sequence': item.item_index,
        'source': get_dataset_item_source(item),
        'metadata': get_dataset_item_metadata(item),
        'referenceAnswer': get_dataset_item_reference_answer(item),
    }


def serialize_import_summary(dataset: Dataset, items: list[DatasetItem], errors: list[str]) -> dict:
    return {
        'dataset': serialize_dataset(dataset),
        'summary': {'total': len(items)},
        'errors': errors,
        'previewItems': [serialize_dataset_item(item) for item in items[:5]],
    }


def _detect_source_type(file_name: str) -> str:
    lowered = file_name.lower()
    if lowered.endswith('.json'):
        return 'json'
    if lowered.endswith('.jsonl'):
        return 'jsonl'
    if lowered.endswith('.xlsx'):
        return 'excel'
    raise HTTPException(status_code=400, detail=f'unsupported file type: {file_name}')


def _decode_base64(content_base64: str) -> bytes:
    try:
        return base64.b64decode(content_base64)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail='invalid base64 content') from exc


def _parse_json_payload(payload: str) -> DatasetImportParseResult:
    data = json.loads(payload)
    if not isinstance(data, list):
        raise DatasetImportError('json payload must be an array of objects')

    items = [_build_item(row) for row in data]
    return DatasetImportParseResult(items=items)


def _parse_jsonl_payload(payload: str) -> DatasetImportParseResult:
    items: list[DatasetImportItem] = []
    for line in payload.splitlines():
        stripped_line = line.strip()
        if not stripped_line:
            continue
        row = json.loads(stripped_line)
        items.append(_build_item(row))
    return DatasetImportParseResult(items=items)


def _parse_excel_bytes(raw_bytes: bytes) -> DatasetImportParseResult:
    try:
        with zipfile.ZipFile(io.BytesIO(raw_bytes)) as archive:
            shared_strings = _read_shared_strings(archive)
            headers, rows = _read_sheet_rows(archive, shared_strings)
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail='invalid excel file') from exc

    if not headers:
        raise HTTPException(status_code=400, detail='excel header row is required')

    items: list[DatasetImportItem] = []
    for row in rows:
        source = {header: value for header, value in zip(headers, row) if header}
        if any(str(value).strip() for value in source.values()):
            items.append(classify_dataset_row(source))

    return DatasetImportParseResult(items=items)


def _read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ElementTree.fromstring(archive.read('xl/sharedStrings.xml'))
    except KeyError:
        return []

    namespace = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    values: list[str] = []
    for item in root.findall('main:si', namespace):
        text = ''.join(node.text or '' for node in item.findall('.//main:t', namespace))
        values.append(text)
    return values


def _read_sheet_rows(archive: zipfile.ZipFile, shared_strings: list[str]) -> tuple[list[str], list[list[str]]]:
    root = ElementTree.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    namespace = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows: list[list[str]] = []
    for row in root.findall('main:sheetData/main:row', namespace):
        values: list[str] = []
        next_column_index = 0
        for cell in row.findall('main:c', namespace):
            cell_reference = cell.attrib.get('r', '')
            column_letters = ''.join(character for character in cell_reference if character.isalpha())
            column_index = _column_letters_to_index(column_letters) if column_letters else next_column_index
            while next_column_index < column_index:
                values.append('')
                next_column_index += 1

            values.append(_read_cell_value(cell, namespace, shared_strings))
            next_column_index = column_index + 1
        rows.append(values)

    if not rows:
        return [], []
    return rows[0], rows[1:]


def _read_cell_value(cell: ElementTree.Element, namespace: dict[str, str], shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get('t')
    if cell_type == 'inlineStr':
        inline_node = cell.find('main:is', namespace)
        if inline_node is None:
            return ''
        return ''.join(text_node.text or '' for text_node in inline_node.findall('.//main:t', namespace))

    value_node = cell.find('main:v', namespace)
    value = value_node.text if value_node is not None else ''
    if cell_type == 's' and value:
        try:
            return shared_strings[int(value)]
        except (IndexError, ValueError):
            return ''
    return value or ''


def _column_letters_to_index(column_letters: str) -> int:
    index = 0
    for character in column_letters:
        index = index * 26 + (ord(character.upper()) - ord('A') + 1)
    return max(index - 1, 0)


def _build_item(row: object) -> DatasetImportItem:
    if not isinstance(row, dict):
        raise DatasetImportError('dataset item must be a json object')
    return classify_dataset_row(row)
