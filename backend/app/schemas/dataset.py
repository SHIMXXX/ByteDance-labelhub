from pydantic import BaseModel, Field


class DatasetImportItem(BaseModel):
    source: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)
    reference_answer: dict = Field(default_factory=dict)


class DatasetImportParseResult(BaseModel):
    items: list[DatasetImportItem]
