from fastapi import FastAPI

app = FastAPI(title="JobFit agent")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
