"""Project folders + saved research."""
from fastapi import APIRouter, Depends, HTTPException

from deps import db, new_id, now_iso, require_user
from models import FolderCreate, SaveResearch

router = APIRouter()


@router.post("/folders")
async def create_folder(payload: FolderCreate, current=Depends(require_user)):
    folder = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "name": payload.name,
        "description": payload.description or "",
        "owner_id": current["id"],
        "member_ids": list(set(payload.member_ids + [current["id"]])),
        "created_at": now_iso(),
    }
    await db.folders.insert_one(folder.copy())
    return folder


@router.get("/folders")
async def list_folders(current=Depends(require_user)):
    folders = await db.folders.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).to_list(1000)
    return folders


@router.get("/folders/{folder_id}")
async def get_folder(folder_id: str, current=Depends(require_user)):
    folder = await db.folders.find_one(
        {"id": folder_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not folder:
        raise HTTPException(404, "Folder not found")
    saved = await db.saved_research.find(
        {"project_folder_id": folder_id}, {"_id": 0}
    ).to_list(1000)
    tasks = await db.tasks.find(
        {"project_folder_id": folder_id}, {"_id": 0}
    ).to_list(1000)
    related_chats = await db.chats.find(
        {"project_folder_id": folder_id}, {"_id": 0}
    ).to_list(1000)
    # Files uploaded inside any of those chats are auto-linked to this folder.
    files = await db.files.find(
        {
            "project_folder_id": folder_id,
            "is_deleted": False,
        },
        {"_id": 0, "storage_path": 0},
    ).sort("created_at", -1).to_list(1000)
    return {
        "folder": folder,
        "saved_research": saved,
        "tasks": tasks,
        "chats": related_chats,
        "files": files,
    }


@router.patch("/folders/{folder_id}")
async def update_folder(folder_id: str, payload: FolderCreate, current=Depends(require_user)):
    await db.folders.update_one(
        {"id": folder_id, "workspace_id": current["workspace_id"]},
        {"$set": {"name": payload.name, "description": payload.description or ""}},
    )
    return await db.folders.find_one({"id": folder_id}, {"_id": 0})


@router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, current=Depends(require_user)):
    await db.folders.delete_one(
        {"id": folder_id, "workspace_id": current["workspace_id"]}
    )
    return {"ok": True}


@router.post("/folders/{folder_id}/save-research")
async def save_research(folder_id: str, payload: SaveResearch, current=Depends(require_user)):
    folder = await db.folders.find_one(
        {"id": folder_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not folder:
        raise HTTPException(404, "Folder not found")
    saved = {
        "id": new_id(),
        "project_folder_id": folder_id,
        "research_thread_id": payload.research_thread_id,
        "title": payload.title,
        "final_answer": payload.final_answer,
        "saved_by": current["id"],
        "created_at": now_iso(),
    }
    await db.saved_research.insert_one(saved.copy())
    return saved
