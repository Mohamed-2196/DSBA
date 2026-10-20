"""Notes shared with a module (IDEA-29): a copy of one note, read by everyone who may read the module, credited or
not; updated or unshared by its writer only; reported, hidden and shown by moderators; never anything else of the
writer's notebook; its files served while the copy shows them; hidden modules, the switch, the limits, export and
deletion."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import AuditEntry, Module, Notification, SharedNote, Upload, UploadStatus, User, UserStatus
from app.services import shared_notes as svc
from tests.core.helpers import PNG, upload
from tests.notes.test_notes import doc, ink, new_note, picture_doc, save, statuses, stroke

API = "/api/v1"
ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


@pytest.fixture(autouse=True)
def sharing_on(set_feature: Callable[..., None]) -> None:
    set_feature("notes.share", "everyone")


def share(c: TestClient, note: dict[str, Any], status: int = 200, **body: Any) -> dict[str, Any]:
    r = c.put(f"{API}/notes/{note['id']}/share", json=body)
    assert r.status_code == status, r.text
    out: dict[str, Any] = r.json()
    return out


def test_a_shared_note_is_a_copy_everyone_reads_with_its_writers_name(
    client_for: ClientFor, make_user: MakeUser, module: Module
) -> None:
    reem = make_user(name="Reem Writer", year=3)
    c = client_for(reem)
    note = new_note(c, "f(x) = λe^{-λx}", moduleId=module.id, title="Exponential")
    assert ink(c, note, 1000, [stroke()], 0).status_code == 200
    private = new_note(c, "My diary of the term", moduleId=module.id, title="Private")

    shared = share(c, note)
    assert shared["title"] == "Exponential"
    assert shared["author"]["displayName"] == "Reem Writer"
    assert shared["author"]["year"] == 3
    assert (shared["mine"], shared["hidden"], shared["canModerate"]) == (True, False, False)
    assert [p["sheet"] for p in shared["ink"]] == [1000]

    for reader in (client_for(), client_for(make_user(name="Hamad Reader", year=2))):
        listed = reader.get(f"{API}/shared-notes?moduleId={module.id}").json()
        assert [n["title"] for n in listed["items"]] == ["Exponential"]  # never the private note
        assert listed["items"][0]["excerpt"].startswith("f(x)")
        assert listed["items"][0]["mine"] is False
        one = reader.get(f"{API}/shared-notes/{shared['id']}")
        assert one.status_code == 200
        assert one.json()["doc"] == note["doc"]
        assert one.json()["moduleTitle"] == module.name
        # the note itself, and the other note, stay private
        assert reader.get(f"{API}/notes/{note['id']}").status_code in (401, 404)
        assert reader.get(f"{API}/notes/{private['id']}").status_code in (401, 404)

    mine = c.get(f"{API}/notes/{note['id']}").json()
    assert mine["share"]["id"] == shared["id"]
    assert mine["share"]["upToDate"] is True
    assert c.get(f"{API}/notes/{private['id']}").json()["share"] is None


def test_shared_without_a_name(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user(name="Shy Writer"))
    note = new_note(c, moduleId=module.id)
    shared = share(c, note, credited=False)
    assert shared["author"] is None
    listed = client_for().get(f"{API}/shared-notes?moduleId={module.id}").json()
    assert listed["items"][0]["author"] is None
    assert c.get(f"{API}/notes/{note['id']}").json()["share"]["credited"] is False


def test_the_copy_stays_as_shared_until_the_writer_updates_it(
    client_for: ClientFor, make_user: MakeUser, module: Module
) -> None:
    c = client_for(make_user())
    note = new_note(c, "First version", moduleId=module.id)
    shared = share(c, note)
    later = save(c, note, doc=doc("Second version"))
    assert later.status_code == 200
    reader = client_for()
    assert reader.get(f"{API}/shared-notes/{shared['id']}").json()["doc"] == doc("First version")
    assert c.get(f"{API}/notes/{note['id']}").json()["share"]["upToDate"] is False

    again = share(c, later.json())
    assert again["id"] == shared["id"]  # the same copy, in the same place
    assert again["sharedAt"] == shared["sharedAt"]
    assert reader.get(f"{API}/shared-notes/{shared['id']}").json()["doc"] == doc("Second version")
    assert c.get(f"{API}/notes/{note['id']}").json()["share"]["upToDate"] is True


def test_only_the_writer_updates_or_unshares_it(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    owner = client_for(make_user())
    note = new_note(owner, moduleId=module.id)
    shared = share(owner, note)
    other = client_for(make_user())
    assert other.put(f"{API}/notes/{note['id']}/share", json={}).status_code == 404
    assert other.delete(f"{API}/shared-notes/{shared['id']}").status_code == 404
    assert client_for().delete(f"{API}/shared-notes/{shared['id']}").status_code in (401, 403)

    assert owner.delete(f"{API}/shared-notes/{shared['id']}").status_code == 204
    assert other.get(f"{API}/shared-notes/{shared['id']}").status_code == 404
    assert other.get(f"{API}/shared-notes?moduleId={module.id}").json()["items"] == []
    assert owner.get(f"{API}/notes/{note['id']}").status_code == 200  # the note stays
    assert owner.get(f"{API}/notes/{note['id']}").json()["share"] is None
    assert owner.delete(f"{API}/shared-notes/{shared['id']}").status_code == 404


def test_what_cant_be_shared(client_for: ClientFor, make_user: MakeUser, module: Module, db: Session) -> None:
    c = client_for(make_user())
    loose = new_note(c)  # no module
    assert share(c, loose, 422)["error"]["fields"]["noteId"].startswith("Pick the note's module")
    empty = c.post(f"{API}/notes", json={"moduleId": module.id}).json()
    assert "Write something" in share(c, empty, 422)["error"]["fields"]["noteId"]
    note = new_note(c, moduleId=module.id)
    db.execute(update(Module).where(Module.id == module.id).values(hidden=True))
    db.commit()
    assert "isn't open to students" in share(c, note, 422)["error"]["fields"]["noteId"]
    assert c.put(f"{API}/notes/00000000-0000-0000-0000-000000000000/share", json={}).status_code == 404


def test_a_note_too_big_is_refused(
    client_for: ClientFor, make_user: MakeUser, module: Module, monkeypatch: pytest.MonkeyPatch
) -> None:
    c = client_for(make_user())
    note = new_note(c, "x" * 400, moduleId=module.id)
    monkeypatch.setattr(svc, "SHARE_MAX_BYTES", 200)
    assert "too big to share" in share(c, note, 422)["error"]["fields"]["noteId"]


def test_shares_are_rate_limited(
    client_for: ClientFor, make_user: MakeUser, module: Module, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "SHARES_PER_HOUR", 2)
    c = client_for(make_user())
    share(c, new_note(c, "one", moduleId=module.id))
    share(c, new_note(c, "two", moduleId=module.id))
    r = c.put(f"{API}/notes/{new_note(c, 'three', moduleId=module.id)['id']}/share", json={})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"


def test_a_suspended_writer_cant_share(client_for: ClientFor, make_user: MakeUser, module: Module, db: Session) -> None:
    user = make_user()
    c = client_for(user)
    note = new_note(c, moduleId=module.id)
    user.status = UserStatus.suspended
    db.commit()
    assert c.put(f"{API}/notes/{note['id']}/share", json={}).status_code == 403


def test_its_pictures_are_served_while_the_copy_shows_them(
    client_for: ClientFor, make_user: MakeUser, module: Module, storage: Any, db: Session
) -> None:
    c = client_for(make_user())
    picture = upload(c, storage, purpose="note_file", name="board.png", content_type="image/png", body=PNG)
    hidden_one = upload(c, storage, purpose="note_file", name="other.png", content_type="image/png", body=PNG)
    note = new_note(c, doc=picture_doc(picture), moduleId=module.id)
    new_note(c, doc=picture_doc(hidden_one), moduleId=module.id, title="Not shared")
    shared = share(c, note)
    reader = client_for()
    shown = reader.get(f"{API}/shared-notes/{shared['id']}/files/{picture}", follow_redirects=False)
    assert shown.status_code == 302
    assert "inline" in shown.headers["location"]
    # a picture of another note, and the note's own file route, stay private
    assert reader.get(f"{API}/shared-notes/{shared['id']}/files/{hidden_one}").status_code == 404
    assert client_for(make_user()).get(f"{API}/notes/files/{picture}").status_code == 404

    # the writer takes the picture out of the note, then deletes the note: the copy keeps it until it goes
    assert save(c, note, doc=doc("No picture")).status_code == 200
    assert statuses(db, picture) == [UploadStatus.attached]
    assert reader.get(f"{API}/shared-notes/{shared['id']}/files/{picture}", follow_redirects=False).status_code == 302
    assert c.delete(f"{API}/shared-notes/{shared['id']}").status_code == 204
    assert statuses(db, picture) == [UploadStatus.released]


def test_deleting_the_note_deletes_the_copy(
    client_for: ClientFor, make_user: MakeUser, module: Module, storage: Any, db: Session
) -> None:
    c = client_for(make_user())
    picture = upload(c, storage, purpose="note_file", name="board.png", content_type="image/png", body=PNG)
    note = new_note(c, doc=picture_doc(picture), moduleId=module.id)
    shared = share(c, note)
    assert c.delete(f"{API}/notes/{note['id']}").status_code == 204
    assert client_for().get(f"{API}/shared-notes/{shared['id']}").status_code == 404
    assert statuses(db, picture) == [UploadStatus.released]


def test_moderators_hide_and_show_it_and_the_writer_is_told(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    writer = make_user(name="Writer")
    c = client_for(writer)
    shared = share(c, new_note(c, moduleId=module.id, title="Cheat sheet"))
    rep = client_for(make_user(name="Rep", roles=("student", "rep")))
    student = client_for(make_user())

    assert student.post(f"{API}/shared-notes/{shared['id']}/hide", json={}).status_code == 403
    hidden = rep.post(f"{API}/shared-notes/{shared['id']}/hide", json={"reason": "A copied study guide."})
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["hidden"] is True
    assert hidden.json()["canModerate"] is True

    assert student.get(f"{API}/shared-notes/{shared['id']}").status_code == 404
    assert client_for().get(f"{API}/shared-notes?moduleId={module.id}").json()["items"] == []
    assert c.get(f"{API}/shared-notes/{shared['id']}").json()["hidden"] is True  # the writer still sees it
    assert rep.get(f"{API}/shared-notes/{shared['id']}").status_code == 200
    assert c.get(f"{API}/notes/{shared['id']}").status_code == 404
    told = db.scalars(select(Notification).where(Notification.user_id == writer.id)).all()
    assert [n.body for n in told] == ["A copied study guide."]

    # updating it doesn't bring it back
    note_id = db.get(SharedNote, shared["id"]).note_id  # type: ignore[union-attr]
    assert c.put(f"{API}/notes/{note_id}/share", json={}).json()["hidden"] is True

    shown = rep.post(f"{API}/shared-notes/{shared['id']}/show")
    assert shown.status_code == 200
    assert student.get(f"{API}/shared-notes/{shared['id']}").status_code == 200
    actions = db.scalars(
        select(AuditEntry.action).where(AuditEntry.target_type == "shared_note").order_by(AuditEntry.id)
    ).all()
    assert actions == ["shared_note.hide", "shared_note.show"]


def test_anyone_signed_in_may_report_it_and_library_reps_get_the_report(
    client_for: ClientFor, make_user: MakeUser, module: Module
) -> None:
    c = client_for(make_user(name="Writer"))
    shared = share(c, new_note(c, moduleId=module.id, title="Cheat sheet"))
    reporter = client_for(make_user())
    body = {"targetType": "shared_note", "targetId": shared["id"], "reason": "copyright"}
    assert reporter.post(f"{API}/reports", json=body).status_code == 204
    assert reporter.post(f"{API}/reports", json=body).status_code == 409
    queue = client_for(make_user(roles=("student", "rep"))).get(f"{API}/admin/reports").json()["items"]
    mine = [r for r in queue if r["targetId"] == shared["id"]]
    assert len(mine) == 1
    assert mine[0]["targetUrl"] == f"/notes/shared/{shared['id']}"
    assert mine[0]["targetTitle"] == "Cheat sheet"
    assert mine[0]["targetStatus"] == "visible"
    assert mine[0]["targetAuthor"]["displayName"] == "Writer"


def test_a_hidden_module_hides_its_shared_notes(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    c = client_for(make_user())
    shared = share(c, new_note(c, moduleId=module.id))
    db.execute(update(Module).where(Module.id == module.id).values(hidden=True))
    db.commit()
    for viewer in (client_for(), c):
        assert viewer.get(f"{API}/shared-notes/{shared['id']}").status_code == 404
        assert viewer.get(f"{API}/shared-notes?moduleId={module.id}").status_code == 404
    rep = client_for(make_user(roles=("student", "rep")))
    assert rep.get(f"{API}/shared-notes/{shared['id']}").status_code == 200


def test_the_switch(client_for: ClientFor, make_user: MakeUser, module: Module, set_feature: Any) -> None:
    c = client_for(make_user())
    note = new_note(c, moduleId=module.id)
    shared = share(c, note)
    set_feature("notes.share", "off")
    assert client_for().get(f"{API}/shared-notes?moduleId={module.id}").status_code == 404
    assert c.get(f"{API}/shared-notes/{shared['id']}").json()["error"]["code"] == "feature_off"
    set_feature("notes.share", "everyone")
    set_feature("notes", "off")  # sharing needs the notebook; reading doesn't
    assert c.put(f"{API}/notes/{note['id']}/share", json={}).status_code == 404
    assert client_for().get(f"{API}/shared-notes/{shared['id']}").status_code == 200


def test_export_and_deletion(
    client_for: ClientFor, make_user: MakeUser, module: Module, storage: Any, db: Session
) -> None:
    user = make_user()
    c = client_for(user)
    picture = upload(c, storage, purpose="note_file", name="board.png", content_type="image/png", body=PNG)
    note = new_note(c, doc=picture_doc(picture), moduleId=module.id, title="Shared one")
    shared = share(c, note, credited=False)
    exported = c.get(f"{API}/me/export").json()["sharedNotes"]
    assert [(s["id"], s["noteId"], s["title"], s["credited"]) for s in exported] == [
        (shared["id"], note["id"], "Shared one", False)
    ]
    r = c.delete(f"{API}/me")
    assert r.status_code in (200, 204), r.text
    db.expire_all()
    assert db.get(SharedNote, shared["id"]) is None
    assert db.get(Upload, picture) is None
    assert client_for().get(f"{API}/shared-notes/{shared['id']}").status_code == 404


def test_a_report_never_names_who_shared_without_a_name_except_to_admins(
    client_for: ClientFor, make_user: MakeUser, module: Module
) -> None:
    c = client_for(make_user(name="Shy Writer"))
    shared = share(c, new_note(c, moduleId=module.id, title="Unnamed"), credited=False)
    body = {"targetType": "shared_note", "targetId": shared["id"], "reason": "other", "note": "Who wrote this?"}
    assert client_for(make_user()).post(f"{API}/reports", json=body).status_code == 204

    def author_seen_by(user: User) -> Any:
        items = client_for(user).get(f"{API}/admin/reports").json()["items"]
        return next(r for r in items if r["targetId"] == shared["id"])["targetAuthor"]

    assert author_seen_by(make_user(roles=("student", "rep"))) is None
    assert author_seen_by(make_user(roles=("student", "admin")))["displayName"] == "Shy Writer"


def test_unsharing_and_sharing_again_keeps_a_hidden_copy_hidden(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    c = client_for(make_user())
    note = new_note(c, moduleId=module.id, title="Copied guide")
    shared = share(c, note)
    rep = client_for(make_user(roles=("student", "rep")))
    assert rep.post(f"{API}/shared-notes/{shared['id']}/hide", json={}).status_code == 200

    assert c.delete(f"{API}/shared-notes/{shared['id']}").status_code == 204
    assert c.get(f"{API}/notes/{note['id']}").json()["share"] is None
    assert rep.get(f"{API}/shared-notes/{shared['id']}").status_code == 404  # emptied and gone for everyone
    left = db.get(SharedNote, shared["id"])
    assert left is not None
    assert (left.hidden, left.doc, left.uploads) == (True, {}, [])

    again = share(c, note)
    assert again["id"] == shared["id"]
    assert again["hidden"] is True  # still hidden: unsharing doesn't undo a moderator
    assert client_for().get(f"{API}/shared-notes?moduleId={module.id}").json()["items"] == []
    assert client_for().get(f"{API}/shared-notes/{shared['id']}").status_code == 404


def test_unsharing_never_gives_back_a_share(
    client_for: ClientFor, make_user: MakeUser, module: Module, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "SHARES_PER_HOUR", 3)
    c = client_for(make_user())
    note = new_note(c, moduleId=module.id)
    shared = share(c, note)  # 1
    assert c.delete(f"{API}/shared-notes/{shared['id']}").status_code == 204  # 2
    share(c, note)  # 3
    r = c.delete(f"{API}/shared-notes/{shared['id']}")
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    assert share(c, new_note(c, "another", moduleId=module.id), 429)["error"]["code"] == "rate_limited"
