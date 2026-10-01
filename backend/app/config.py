from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Kamboocha API"
    api_prefix: str = "/api"
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_database: str = "kamboocha"
    allowed_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(env_prefix="KAMBOOCHA_", env_file=".env")


settings = Settings()
