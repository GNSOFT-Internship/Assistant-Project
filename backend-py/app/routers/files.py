import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..database import get_db

router = APIRouter(prefix="/api/files", tags=["files"])


def file_to_response(f: models.FileUpload) -> dict:
    return {
        "id": f.id,
        "filename": f.filename,
        "originalFilename": f.original_filename,
        "fileType": f.file_type.value if f.file_type else None,
        "status": f.status.value if f.status else None,
        "applied": f.applied,
    }


def detect_file_type(filename: str) -> models.FileType:
    if not filename:
        return models.FileType.PDF
    lower = filename.lower()
    if lower.endswith(".csv"):
        return models.FileType.CSV
    if lower.endswith(".xlsx") or lower.endswith(".xls"):
        return models.FileType.EXCEL
    return models.FileType.PDF


@router.get("")
def get_all_files(db: Session = Depends(get_db)):
    files = db.query(models.FileUpload).all()
    return {"success": True, "message": None, "data": [file_to_response(f) for f in files]}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        os.makedirs(settings.UPLOAD_DIRECTORY, exist_ok=True)
        original_filename = file.filename
        filename = f"{uuid.uuid4()}_{original_filename}"
        file_path = os.path.join(settings.UPLOAD_DIRECTORY, filename)

        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)

        file_upload = models.FileUpload(
            filename=filename,
            original_filename=original_filename,
            file_type=detect_file_type(original_filename),
            file_path=file_path,
            status=models.UploadStatus.PENDING,
            applied=False,
        )
        db.add(file_upload)
        db.commit()
        db.refresh(file_upload)

        return {"success": True, "message": "File uploaded successfully", "data": file_to_response(file_upload)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File upload failed: {e}")


@router.post("/{file_id}/process")
def process_file(file_id: int, db: Session = Depends(get_db)):
    file_upload = db.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
    if file_upload is None:
        raise HTTPException(status_code=400, detail="File not found")

    try:
        file_upload.status = models.UploadStatus.PROCESSING
        db.commit()

        mock_result = {
            "message": "Mock 분석 완료",
            "filename": file_upload.original_filename,
            "fileType": file_upload.file_type.value if file_upload.file_type else None,
            "uploadTime": file_upload.created_at.isoformat() if file_upload.created_at else None,
            "estimatedRows": 10,
            "sheets": 1,
        }

        file_upload.status = models.UploadStatus.COMPLETED
        file_upload.extracted_data = str(mock_result)
    except Exception as e:
        file_upload.status = models.UploadStatus.FAILED
        file_upload.error_message = str(e)

    file_upload.updated_at = datetime.now()
    db.commit()
    db.refresh(file_upload)
    return {"success": True, "message": "File processed successfully", "data": file_to_response(file_upload)}


@router.post("/{file_id}/apply")
def apply_file(file_id: int, db: Session = Depends(get_db)):
    file_upload = db.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
    if file_upload is None:
        raise HTTPException(status_code=400, detail="File not found")

    if file_upload.status != models.UploadStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Completed file only can be applied")

    file_upload.applied = True
    file_upload.updated_at = datetime.now()
    db.commit()
    db.refresh(file_upload)
    return {"success": True, "message": "File applied successfully", "data": file_to_response(file_upload)}


@router.delete("/{file_id}")
def delete_file(file_id: int, db: Session = Depends(get_db)):
    file_upload = db.query(models.FileUpload).filter(models.FileUpload.id == file_id).first()
    if file_upload is None:
        raise HTTPException(status_code=400, detail="File not found")

    try:
        if file_upload.file_path and os.path.exists(file_upload.file_path):
            os.remove(file_upload.file_path)
    except OSError as e:
        print(f"File deletion failed: {e}")

    db.delete(file_upload)
    db.commit()
    return {"success": True, "message": "File deleted successfully", "data": None}
