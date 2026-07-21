import uvicorn

from tinabrain.config import get_settings


if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "tinabrain.main:app",
        host=settings.tinabrain_host,
        port=settings.tinabrain_port,
        reload=settings.tinabrain_env == "development",
    )
