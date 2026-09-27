from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    demo_mode: bool = True
    graph8_api_key: str = ''
    graph8_base_url: str = 'https://be.graph8.com/api/v1'
    graph8_app_url: str = 'https://app.graph8.com'
    graph8_sequence_id: str = ''
    graph8_subject_field_id: int = 0
    graph8_body_field_id: int = 0
    openai_api_key: str = ''
    openai_model: str = 'gpt-4.1-mini'
    autopilot_api_token: str = ''
    database_path: str = 'autopilot.sqlite3'

settings = Settings()
