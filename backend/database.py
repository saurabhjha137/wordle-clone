import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from config import settings

# Ensure the parent directory exists for SQLite file paths (e.g. /home/data/ on Azure)
_url = settings.DATABASE_URL
if _url.startswith("sqlite:///") and not _url.startswith("sqlite:///./"):
    _db_path = _url.replace("sqlite:///", "")
    _db_dir  = os.path.dirname(_db_path)
    if _db_dir:
        os.makedirs(_db_dir, exist_ok=True)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
