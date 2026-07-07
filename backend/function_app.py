import azure.functions as func
from main import app as fastapi_app

# Wrap FastAPI (ASGI) for Azure Functions consumption plan.
# host.json sets routePrefix="" so FastAPI routes work as-is.
app = func.AsgiFunctionApp(
    app=fastapi_app,
    http_auth_level=func.AuthLevel.ANONYMOUS,
)
