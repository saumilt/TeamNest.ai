"""PDF / DOCX exports — research threads, approvals, and calls."""
from fastapi import APIRouter, Depends, HTTPException, Response

from deps import PROJ, db, require_user
from export_service import export_research, render_docx, render_pdf

router = APIRouter()


@router.get("/export/research/{thread_id}")
async def export_research_doc(
    thread_id: str, format: str = "pdf", current=Depends(require_user)
):
    if format not in ("pdf", "docx"):
        raise HTTPException(400, "format must be pdf or docx")
    thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    responses = await db.ai_responses.find(
        {"research_thread_id": thread_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    payload = export_research(thread, responses)
    if format == "pdf":
        data = render_pdf(payload["title"], payload["sections"])
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="research-{thread_id[:8]}.pdf"'},
        )
    data = render_docx(payload["title"], payload["sections"])
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="research-{thread_id[:8]}.docx"'},
    )


@router.get("/export/approval/{approval_id}")
async def export_approval_doc(
    approval_id: str, format: str = "pdf", current=Depends(require_user)
):
    if format not in ("pdf", "docx"):
        raise HTTPException(400, "format must be pdf or docx")
    a = await db.approvals.find_one(
        {"id": approval_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not a:
        raise HTTPException(404, "Approval not found")
    creator = await db.users.find_one({"id": a["created_by"]}, PROJ)
    sections = [
        {"label": "Status & Metadata", "rows": [
            ["Status", a["status"].upper()],
            ["Version", str(a.get("version") or 1)],
            ["Created by", (creator or {}).get("name", "—")],
            ["Created at", a["created_at"][:19].replace("T", " ")],
            ["Approved at", (a.get("approved_at") or "—")[:19].replace("T", " ")],
            ["Locked", "yes" if a.get("locked") else "no"],
        ]},
        {"label": "Final Answer", "body": a.get("final_answer") or ""},
    ]
    if a.get("decisions"):
        sections.append({"label": "Decisions", "body": "\n\n".join(
            f'• {d["by_name"]} — {d["status"]}: {d.get("comment") or "(no comment)"}'
            for d in a["decisions"]
        )})
    if format == "pdf":
        data = render_pdf(a["title"], sections)
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="approval-{approval_id[:8]}.pdf"'},
        )
    data = render_docx(a["title"], sections)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="approval-{approval_id[:8]}.docx"'},
    )


@router.get("/export/call/{call_id}")
async def export_call_doc(
    call_id: str, format: str = "pdf", current=Depends(require_user)
):
    if format not in ("pdf", "docx"):
        raise HTTPException(400, "format must be pdf or docx")
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not call:
        raise HTTPException(404, "Call not found")
    chat = await db.chats.find_one({"id": call["chat_id"]}, {"_id": 0, "name": 1})
    chat_name = (chat or {}).get("name", "team chat")
    duration = call.get("duration_seconds") or 0
    participants = call.get("participants") or []
    sections = [
        {"label": "Call Metadata", "rows": [
            ["Chat", chat_name],
            ["Mode", call["mode"]],
            ["Started", call["started_at"][:19].replace("T", " ")],
            ["Ended", (call.get("ended_at") or "—")[:19].replace("T", " ")],
            ["Duration", f"{duration // 60}m {duration % 60}s"],
            ["Participants", ", ".join([p.get("name", "—") for p in participants])],
        ]},
    ]
    if call.get("summary", {}).get("markdown"):
        sections.append({"label": "AI Meeting Summary", "body": call["summary"]["markdown"]})
    if (call.get("transcript") or {}).get("text"):
        sections.append({"label": "Transcript", "body": call["transcript"]["text"]})

    title = f"Call · {chat_name}"
    if format == "pdf":
        data = render_pdf(title, sections)
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="call-{call_id[:8]}.pdf"'},
        )
    data = render_docx(title, sections)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="call-{call_id[:8]}.docx"'},
    )
