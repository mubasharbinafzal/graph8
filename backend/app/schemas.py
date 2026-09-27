from typing import Any, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator

class Goal(BaseModel):
    goal: str = Field(min_length=12, max_length=2000)
    @field_validator('goal')
    @classmethod
    def clean(cls, value):
        if len(value.strip()) < 12:
            raise ValueError('Describe your revenue goal in at least 12 characters.')
        return value.strip()

class Plan(BaseModel):
    title: str
    summary: str
    industry: str
    country: str
    min_employees: int = Field(ge=1)
    max_employees: int = Field(ge=1)
    target: int = Field(ge=1, le=100)
    steps: list[str]

class Score(BaseModel):
    score: int = Field(ge=0, le=100)
    qualified: bool
    reasons: list[str]
    caveat: str

class Message(BaseModel):
    subject: str
    body: str

class ReplyAnalysis(BaseModel):
    classification: Literal['INTERESTED', 'NOT_INTERESTED', 'QUESTION', 'UNSUBSCRIBE', 'OUT_OF_OFFICE', 'UNKNOWN']
    confidence: float = Field(ge=0, le=1)
    explanation: str

class NextAction(BaseModel):
    action: Literal['BOOK_MEETING', 'ANSWER_QUESTION', 'STOP_OUTREACH', 'WAIT', 'HUMAN_REVIEW']
    reason: str
    requires_approval: bool = True

class LeadInput(BaseModel):
    goal: str = Field(min_length=12, max_length=2000)
    lead: dict[str, Any]

class ReplyInput(BaseModel):
    reply: str = Field(min_length=1, max_length=10000)

class ActionInput(BaseModel):
    analysis: ReplyAnalysis

class Event(BaseModel):
    id: int
    time: str
    agent: str
    title: str
    detail: str

class Metrics(BaseModel):
    found: int = 0
    qualified: int = 0
    outreach: int = 0
    interested: int = 0
    meetings: int = 0

class Lead(BaseModel):
    company: str
    domain: str
    industry: str
    employees: str
    location: str
    name: str = 'Decision maker'
    role: str = ''
    email: str = ''
    contact_id: int | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)
    score: Score | None = None
    message: Message | None = None
    reply: str | None = None
    analysis: ReplyAnalysis | None = None
    recommendation: NextAction | None = None

class Mission(BaseModel):
    id: str
    goal: str
    plan: Plan
    demo: bool
    status: Literal['ready', 'running', 'awaiting_approval', 'awaiting_outreach', 'waiting_reply', 'complete', 'paused', 'error'] = 'ready'
    stage: int = 0
    progress: int = 0
    events: list[Event] = Field(default_factory=list)
    metrics: Metrics = Field(default_factory=Metrics)
    lead: Lead | None = None
    error: str | None = None
    graph8_url: str
    candidates: list[dict[str, Any]] = Field(default_factory=list, exclude=True)
    booking: dict[str, Any] | None = None
    action_in_flight: str | None = None
    created_at: str

class BookingInput(BaseModel):
    event_type_id: int = Field(gt=0)
    start_time: str
    time_zone: str = 'UTC'

class RunInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mission_id: str
    command: Literal['start', 'advance', 'approve', 'decline', 'outreach'] = 'advance'
    booking: BookingInput | None = None
    # Canonical Graph8 list membership is selected in Graph8, not recreated here.
    list_id: int | None = Field(default=None, gt=0)
