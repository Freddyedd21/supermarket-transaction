from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import analytics

app = FastAPI(title = "Supermercado Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analytics.router)

@app.get("/")
def read_root():
    return {"message": "Bienvenido a la API de Analytics del Supermercado"}