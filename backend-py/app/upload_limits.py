"""업로드 파일 크기 상한을 서버가 직접 강제하기 위한 공용 헬퍼.

이전에는 업로드된 파일을 얼마나 크든 그대로 디스크에 흘려보내거나
(files.py) pandas에 통째로 넘겨(assets.py) 읽게 했다. 두 경로 모두
MAX_UPLOAD_SIZE_BYTES를 넘는 순간 즉시 중단하도록 통일한다.
"""

import os

from fastapi import HTTPException, UploadFile

from .config import settings


def _limit_exceeded_error(max_bytes: int) -> HTTPException:
    return HTTPException(
        status_code=413,
        detail=f"파일 크기가 너무 큽니다. 최대 {max_bytes // (1024 * 1024)}MB까지 업로드할 수 있습니다.",
    )


def copy_upload_to_path(file: UploadFile, dest_path: str, max_bytes: int = None) -> None:
    """업로드 파일을 청크 단위로 디스크에 쓰면서, 누적 크기가 상한을 넘으면
    즉시 예외를 던지고 지금까지 쓴 partial 파일을 지운다."""
    limit = max_bytes if max_bytes is not None else settings.MAX_UPLOAD_SIZE_BYTES
    total = 0
    with open(dest_path, "wb") as f:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > limit:
                f.close()
                os.remove(dest_path)
                raise _limit_exceeded_error(limit)
            f.write(chunk)


def read_upload_bytes(file: UploadFile, max_bytes: int = None) -> bytes:
    """업로드 파일을 상한 이내에서만 메모리로 읽는다. 상한을 넘으면 그 이상은
    읽지 않고 즉시 예외를 던진다 (pandas 등에 무제한으로 넘기지 않기 위함)."""
    limit = max_bytes if max_bytes is not None else settings.MAX_UPLOAD_SIZE_BYTES
    chunks = []
    total = 0
    while True:
        chunk = file.file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise _limit_exceeded_error(limit)
        chunks.append(chunk)
    return b"".join(chunks)
