"""The Career Navigator's content: one document that holders of career.edit save as a whole (PUT /career).

Typed so the API refuses what the page can't show, and the web app's types are generated from these models. Ids are
short slugs that the document's parts refer to each other by (a role's skills, an employer's tracks, a certificate's
roles); the API checks those references, and that module ids name real modules. Links to other sites are https://;
links inside the Hub are pages of it ('/forum/new?title=…').

Tracks, employers, certificates, roles and checklist items can be hidden: the editor keeps them, the public page
doesn't show them (services/career.py public_doc)."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.common import ApiModel, UserPublic
from app.schemas.links import HttpsUrl, HubLink

# An id the document refers to (also the name of a bundled logo file: public/logos/employers/<id>.png).
CareerId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=1, max_length=64)]
ModuleId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=1, max_length=64)]
Mono = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=6)]  # initials on a tile
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]
OfferType = Literal["graduate", "internship", "careers"]
CareerCta = Literal["apply", "programme", "roles"]
Effort = Literal[1, 2, 3]  # light, medium, heavy
Depth = Literal[0, 1, 2, 3]  # not taught, intro only, solid, in depth
ModuleChoice = Literal["option", "elective"]


class CareerTrack(ApiModel):
    id: CareerId
    label: Name
    short: Short
    about: Text
    modules: list[ModuleId] = Field(default=[], max_length=20)  # the closest modules, by id
    hidden: bool = False


class CareerLogo(ApiModel):
    """A logo an editor uploaded (purpose career_logo), served by GET /career/logos/{uploadId}. Only an organisation's
    own logo file, used with its permission: `permission` says who agreed and when."""

    upload_id: UUID
    permission: Text


class CareerOffer(ApiModel):
    type: OfferType
    name: Name | None = None  # only when the programme's name was seen on the employer's own site


class CareerEmployer(ApiModel):
    """A real employer with a presence in Bahrain."""

    id: CareerId
    name: Name
    mono: Mono
    sector: Short
    offers: list[CareerOffer] = Field(default=[], max_length=6)
    tracks: list[CareerId] = Field(default=[], max_length=10)  # track ids, most relevant first
    why: Text
    url: HttpsUrl  # its own careers or programme page
    cta: CareerCta
    logo: CareerLogo | None = None  # None: the bundled file if there is one, else the initials
    hidden: bool = False


class FeaturedLogo(ApiModel):
    kind: Literal["employer", "cert"]
    id: CareerId


class CareerFeatured(ApiModel):
    """The one competition beside the page title."""

    id: CareerId
    kind: Short
    title: Name
    organiser: Name
    mono: Mono
    logo: FeaturedLogo
    badge: Short
    blurb: Text
    note: Text
    url: HttpsUrl


class CertFile(ApiModel):
    """A library file to study from instead of an official page (self-study)."""

    module: ModuleId
    id: Name  # the library item's id or slug


class CareerCert(ApiModel):
    id: CareerId
    name: Name
    short: Short
    issuer: Name
    mono: Mono | None = None
    url: HttpsUrl | None = None  # the official page
    file: CertFile | None = None
    good_for: Text
    effort: Effort
    effort_note: Text
    covers: list[ModuleId] = Field(default=[], max_length=20)  # modules that already teach part of it
    covers_note: Text | None = None
    roles: list[CareerId] = Field(default=[], max_length=20)  # role ids it helps with
    logo: CareerLogo | None = None
    hidden: bool = False


# What to do about a skill DSBA never takes past an intro.
class CloseLesson(ApiModel):
    kind: Literal["lesson"]
    module: ModuleId
    chapter: Name
    text: Text


class CloseFile(ApiModel):
    kind: Literal["file"]
    module: ModuleId
    file: Name  # a library item's id or slug
    text: Text


class CloseCert(ApiModel):
    kind: Literal["cert"]
    cert: CareerId
    text: Text


class CloseForum(ApiModel):
    kind: Literal["forum"]
    to: HubLink
    text: Text


class CloseOpps(ApiModel):
    kind: Literal["opps"]  # the opportunities above (the featured competition)
    text: Text


CloseStep = Annotated[CloseLesson | CloseFile | CloseCert | CloseForum | CloseOpps, Field(discriminator="kind")]


class CareerRole(ApiModel):
    id: CareerId
    label: Short
    title: Name
    about: Text
    tools: list[Short] = Field(default=[], max_length=20)
    skills: list[CareerId] = Field(default=[], max_length=30)  # skill ids, most important first
    ask: Text  # the question "Ask seniors about this role" starts a thread with
    close: dict[CareerId, CloseStep] = Field(default={})  # this role's own step for a skill (by skill id)
    hidden: bool = False


class SkillTaught(ApiModel):
    module: ModuleId
    depth: Depth
    what: Text


class CareerSkill(ApiModel):
    name: Name
    taught: list[SkillTaught] = Field(default=[], max_length=20)  # the modules that teach it, how far
    gap_note: Text | None = None
    close: CloseStep | None = None


class ChecklistLesson(ApiModel):
    kind: Literal["lesson"]
    module: ModuleId
    chapter: Name
    label: Short


class ChecklistCert(ApiModel):
    kind: Literal["cert"]
    cert: CareerId
    label: Short


class ChecklistForum(ApiModel):
    kind: Literal["forum"]
    to: HubLink
    label: Short


ChecklistLink = Annotated[ChecklistLesson | ChecklistCert | ChecklistForum, Field(discriminator="kind")]


class CareerChecklistItem(ApiModel):
    id: CareerId
    title: Name
    hint: Text
    link: ChecklistLink | None = None
    hidden: bool = False


class OfferTypeLabel(ApiModel):
    label: Short
    plural: Short


class OfferTypeLabels(ApiModel):
    graduate: OfferTypeLabel
    internship: OfferTypeLabel
    careers: OfferTypeLabel


class CtaLabels(ApiModel):
    apply: Short
    programme: Short
    roles: Short


class FurtherStudyAction(ApiModel):
    to: HubLink
    label: Short


class FurtherStudy(ApiModel):
    title: Name
    body: Text
    action: FurtherStudyAction


def _unique(items: Iterable[str], what: str) -> None:
    seen: set[str] = set()
    for i in items:
        if i in seen:
            raise PydanticCustomError("duplicate_id", "Two {what} have the same id: “{id}”.", {"what": what, "id": i})
        seen.add(i)


def _known(refs: Iterable[str], known: set[str], what: str) -> None:
    for r in refs:
        if r not in known:
            raise PydanticCustomError(
                "unknown_ref", "There is no {what} “{id}” in the document.", {"what": what, "id": r}
            )


class CareerDoc(ApiModel):
    intro: Text  # under the page's title
    employers_note: Text  # under the employers: what their buttons open, the tags, and the logos
    checked_on: Short  # the day every link was last checked ('2 October 2026')
    initial_count: int = Field(ge=1, le=100)  # employer cards shown before "Show all"
    tracks: list[CareerTrack] = Field(max_length=20)
    offer_types: OfferTypeLabels
    cta_label: CtaLabels
    employers: list[CareerEmployer] = Field(max_length=200)
    featured: CareerFeatured | None
    effort_label: dict[str, Short]  # by effort: '1', '2', '3'
    cert_note: Text
    certs: list[CareerCert] = Field(max_length=100)
    default_role_id: CareerId
    roles: list[CareerRole] = Field(max_length=50)
    depth_label: dict[str, Short]  # by depth: '0' to '3'
    chosen: dict[ModuleId, ModuleChoice] = Field(default={})  # modules a student chooses, by module id
    skills: dict[CareerId, CareerSkill]
    checklist: list[CareerChecklistItem] = Field(max_length=30)
    further_study: FurtherStudy | None
    year_hints: dict[str, Text]  # by cohort: '1', '2', '3'

    @model_validator(mode="after")
    def _references(self) -> CareerDoc:
        """Every id the document refers to is defined in it, once."""
        for items, what in (
            (self.tracks, "tracks"),
            (self.employers, "employers"),
            (self.certs, "certificates"),
            (self.roles, "roles"),
            (self.checklist, "checklist items"),
        ):
            _unique((i.id for i in items), what)
        tracks, roles, skills = {t.id for t in self.tracks}, {r.id for r in self.roles}, set(self.skills)
        certs, employers = {c.id for c in self.certs}, {e.id for e in self.employers}
        _known([self.default_role_id], roles, "role")
        if any(r.hidden for r in self.roles if r.id == self.default_role_id):
            raise PydanticCustomError("hidden_default", "The role the page opens on can't be hidden.")
        logos = [x.upload_id for x in self._logo_list()]
        if len(set(logos)) != len(logos):
            raise PydanticCustomError("shared_logo", "Two employers or certificates use the same logo file.")
        _known((t for e in self.employers for t in e.tracks), tracks, "track")
        _known((s for r in self.roles for s in [*r.skills, *r.close]), skills, "skill")
        _known((r for c in self.certs for r in c.roles), roles, "role")
        steps = [s.close for s in self.skills.values() if s.close] + [c for r in self.roles for c in r.close.values()]
        links = [i.link for i in self.checklist if i.link]
        _known((x.cert for x in [*steps, *links] if isinstance(x, CloseCert | ChecklistCert)), certs, "certificate")
        if self.featured is not None:
            logo = self.featured.logo
            if logo.kind == "employer":
                _known([logo.id], employers, "employer")
            else:
                _known([logo.id], certs, "certificate")
        return self

    def module_refs(self) -> list[str]:
        """Every module id the document names (the API checks they exist)."""
        refs = [m for t in self.tracks for m in t.modules]
        for c in self.certs:
            refs += c.covers + ([c.file.module] if c.file else [])
        for s in self.skills.values():
            refs += [t.module for t in s.taught]
        steps = [s.close for s in self.skills.values() if s.close] + [c for r in self.roles for c in r.close.values()]
        refs += [x.module for x in steps if isinstance(x, CloseLesson | CloseFile)]
        refs += [i.link.module for i in self.checklist if isinstance(i.link, ChecklistLesson)]
        return [*refs, *self.chosen]

    def logo_uploads(self) -> set[UUID]:
        """The uploads the document's logos are (each is attached while the document uses it)."""
        return {x.upload_id for x in self._logo_list()}

    def _logo_list(self) -> list[CareerLogo]:
        return [e.logo for e in self.employers if e.logo] + [c.logo for c in self.certs if c.logo]


class CareerContent(ApiModel):
    """Career Navigator as the public page shows it (hidden parts left out). `data` is None until it is loaded."""

    data: CareerDoc | None
    updated_at: datetime | None


class CareerEditable(ApiModel):
    """The whole document for its editors, hidden parts included, with the version a save must name."""

    data: CareerDoc | None
    version: int  # 0 until the document exists
    updated_at: datetime | None
    updated_by: UserPublic | None


class CareerSave(ApiModel):
    """PUT /career: the whole document, and the version it was edited from."""

    version: int = Field(ge=0)
    data: CareerDoc
