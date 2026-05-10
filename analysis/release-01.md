# Four Layers of Signal

*A close reading of Release 01 of the War Department's UFO disclosure*

**Subject corpus:** war.gov/UFO Release 01 (May 8, 2026)
**Author note:** Written after a week of building the local pipeline (downloader → indexer → classifier), then living inside the SQLite DB with the contents.
**Version:** 1.0 — May 2026

---

I spent the better part of a week downloading, decrypting, OCR-ing, and classifying every artifact in War.gov's first UAP release — 158 records, 288 files, 3.7 GB on disk. What follows is what jumped out. Not from any single document, but from reading the corpus as a system.

The press treated this release as a document drop. I started there too. By day three I'd stopped reading individual PDFs and started watching what the *corpus as a whole* was doing — what was said, what wasn't said, what the file-level metadata revealed, and where the redaction pipeline left fingerprints it didn't mean to leave. There are four layers of signal here. The most interesting things in Release 01 don't sit cleanly inside any one of them; they live at the intersections.

This isn't a UAP claim. I'm not telling you whether the Phenomenon is non-human, advanced, or anything else. I'm telling you what the government wrote, what's missing, and what the documents themselves — and the tooling around them — give away.

A note on convention: every analytical claim ends with a tag — **Strong**, **Suggestive**, or **Open**. *Strong* means I can quote primary text in the government's voice. *Suggestive* means a pattern that admits one obvious reading and several less obvious ones. *Open* means an observation whose meaning is genuinely unknown to me. The tagging is mine; the discipline is real.

---

## §1 — Why a single document undersells the release

On day one I was reading PDFs. By day two I was reading EXIF. By day three I was making notes about what wasn't there. By day four I was watching the broken outputs of someone else's redaction pipeline leak signal it didn't mean to leak. That sequence is the structure of this paper.

The press take on Release 01 was, roughly: *"Pentagon dumps 158 declassified UAP files."* Read that way, the corpus is a stack of declassified documents, some interesting, most boring. The interesting ones get clipped into news stories; the rest sit unread.

That framing under-reads the release by an order of magnitude. Release 01 is a federation. It's six US agencies plus a foreign civilian institute, eight decades of artifacts, a structured modern intake form, a hand-built CSV index, a release-morning PowerPoint deck, and 109 of 116 PDFs shipped with intentional copy-restrictions that any analyst can defeat in five seconds. Each of those is a fact about *the release*, not about any document inside it.

So I started reading it as four interlocking layers:

1. **Content** — what the documents say in primary government voice.
2. **Metadata / forensics** — the EXIF, PDF info dicts, encryption flags, software fingerprints embedded in the files.
3. **Absences** — terms, programs, people, and famous artifacts that *do not* appear.
4. **Process artifacts** — corruption patterns, redaction-tool fingerprints, manifest data-quality bugs, declassification stamps, internal release-clearance dates that lead the public release by months.

Anyone who's followed UAP discourse since *Project Sign* through Lue Elizondo's 2017 New York Times story has internalized that disclosure happens in *layers* — official statements, leaked memos, hearings, FOIA, whistleblowers. Release 01 itself is multi-layered in that older sense: it's an event in the long disclosure arc. This paper is about reading the *internal* layering of the release itself.

The second-best signal I found in this corpus is in the documents. The best signal is at the intersections: a content claim plus a metadata fingerprint plus an absence plus a process artifact, all at once, telling you something none of the four alone could tell you. Section 7 is where I get to those.

---

## §2 — The corpus at a glance

Before any analysis, the shape of what we're looking at:

| | |
|---|---|
| Records (after dedup of gov data quirks) | 158 |
| Files | 288 (116 PDF, 14 image, 130 thumbnail, 28 video) |
| On-disk total | 3.7 GB |
| PDFs with extracted text | 92 (51 from text-layer, 41 from OCR) |
| PDFs with no extractable text | 24 (all photo-only PDFs of FBI evidence images) |
| Time span (earliest content → release) | June 1947 → May 8, 2026 (79 years) |

Federation of authoring agencies in the corpus:

- **FBI** — case file 62-HQ-83894, 1947-1968 era, plus several Box-numbered serial files
- **Department of State** — five embassy cables: Papua New Guinea (1985), Embassy Dushanbe (1994), Tbilisi via Moscow (2001), Ashgabat (2004), Mexico City (2023)
- **NASA** — Gemini 7 transcript and audio (1965), Apollo 11/12/17 transcripts and crew debriefings (1969-1973), Skylab Technical Crew Debriefing (1973), plus six Apollo VM image sets
- **U.S. Air Force** — Vandenberg launch summary (1958-2000), launch-failure modeling report (1996)
- **Department of War** — 41 modern Mission Reports + Range Fouler Debriefs from CENTCOM, INDOPACOM, AFRICOM, NORTHCOM, the Department of the Army, and the Department of the Air Force
- **Department of the Army** — overlapping with DoW
- **COMETA** — *foreign civilian* analytical report from France's *Institut des Hautes Études de Défense Nationale* (1999)

The agencies that *don't* appear in Release 01 as authors: CIA, NRO, NSA, DIA. (**Open** — for now. We'll come back to this in §5.2; the picture is more complicated than "absent.")

The classifier I ran across the whole corpus produced this tier distribution:

| Tier | Count | Definition |
|---|---|---|
| **T1** Smoking gun | 7 | Primary-source US gov doc, in its own voice, making an extraordinary claim |
| **T2** Strong signal | 47 | Direct evidence of a coordinated program, pattern, or institutional behavior |
| **T3** Notable / forensic | 65 | Provenance / forensic clue from metadata |
| **T4** Historical canon | 0 | Subsumed by higher tiers — every record matching `Roswell` / `Maury` / `Blue Book` also hits T1/T2/T3 in this corpus |
| **T5** Adjacent / context | 39 | Tangential material swept into the disclosure |

The seven T1 records are the spine of the release: four FBI 62-HQ-83894 sections, the COMETA report, the Embassy Dushanbe cable, and the Embassy Mexico City cable. We'll spend most of §3 on them.

---

## §3 — Layer 1: what they wrote in their own voice

The strongest claims in this paper live here. The corpus contains primary-source US government text that uses the word **extraterrestrial** as a working hypothesis, that captures astronaut reports of unidentified objects in lunar transit and earth orbit, and that institutionalizes the question *"is this thing under intelligent control?"* into a 2020s Pentagon intake form.

None of that is a UAP claim by me. It is a documentation claim about what the government wrote.

### §3.1 — The FBI 62-HQ-83894 file (1947-1968)

The FBI's 62-HQ-83894 case file shows up in Release 01 as ten sections plus several serial-numbered subdocuments. Across that file, the word *extraterrestrial* appears in three distinct contexts. Reading them carefully matters, because they're not all the FBI's voice.

**Section 10** contains this passage:

> *"…since Flying Saucers are no longer Unidentified Flying Objects as far as we are concerned. Flying Saucers have become a serious issue with thinking people all over the world. We believe that most of the objects which have been sighted have been of extraterrestrial origin, controlled by intelligent beings who, in form, are very much like us."*

That's the Bureau speaking, right? **No.** Read carefully and you can see the columnar magazine layout in the OCR — there's a sidebar listing UFO conventions ("OCTOBER 29, 30: 10th ANNUAL NORTHERN CALIFORNIA SPACECRAFT CONVENTION, Claremont Hotel, Berkeley, Calif."), notice of a magazine masthead change ("OUR NEW NAME: Our magazine, formerly called 'UFO International', has now become 'Flying Saucers International'"), and an obituary for Dr. Raymond Bernard, founder of the Biosophical Society of Santa Caterina. This is a 1960s contactee newsletter that the FBI clipped and filed. The Bureau wasn't writing it; they were *tracking* it.

**Section 7** is similar. The "extraterrestrial animals" line —

> *"some fa[ir]ly strange theories occurred to them — the possibility that extraterrestrial animals were flying into our atmosphere, for example. (No data turned up to support that arresting idea.)"*

— sits in a column flanked by ads ("DIRECT MATTRESS CO", "EXETER Hosiery Mills"). Magazine reportage about Air Force Cambridge Research Lab investigators ("Dr. George Valley, a nuclear physicist at MIT… an assortment of physicists and aerodynamicists who specialize in the study of the stratosphere"). Again: tracked, filed, but not authored by the Bureau.

**Section 9** is different. The "extraterrestrial vehicles" reference appears in a passage with classic FBI memo formatting:

> *"It is understood that JANAP 146 is a Department of Defense document and is not, as such, applicable to the operations of the Federal Bureau of Investigation. Possible communication with extraterrestrial vehicles from another planet, should the unidentified flying objects prove to be extraterrestrial, is not […]"*

The footer carries a typist's identifier (`ESS:jas`) and references "cover memo Donahoe to Belmont" dated 9/26/58 — that's Alan Belmont, FBI Assistant Director for Intelligence Division. *This* is internal Bureau analytical voice. The Bureau is engaging — internally — with the question of whether UFOs prove to be extraterrestrial vehicles, and what the disclosure rules would be if they did. **Strong.**

So the precise claim is: the FBI's 1947-68 case file catalogues the term *extraterrestrial* in two registers — civilian publications the Bureau collected and internal correspondence about how to handle the question. The internal-voice instance is one document, not three. But the Bureau maintained a case file on UFOs that used the word at all — internally, in 1958, by an Assistant Director's office — and that case file is what they just released. **Strong** for the cataloguing claim; **Suggestive** for what its release implies about the post-2024 internal posture.

A misread to flag explicitly because it's the easiest paragraph in the corpus to weaponize incorrectly: the same FBI file contains the line *"The bodies were recovered and transported in the ambulance to McCHORD"*. That is the **Maury Island incident** — June 1947, FBI agents Frank Brown and Cal Davidson killed in a B-25 crash near Kelso, Washington after collecting alleged UFO debris from Harold Dahl. The bodies are the *agents*. Not aliens. Anyone quoting that line outside its context would mislead their readers; I'd rather have it on the record here.

### §3.2 — Embassy Dushanbe, January 1994

Cable MRN `94 DUSHANBE 259`. Filed by the U.S. Embassy in Dushanbe, Tajikistan, to SECSTATE WASHDC and AMEMBASSY MOSCOW. Subject: *"TAJIK AIR PILOTS REPORT UNIDENTIFIED FLYING OBJECT."*

The witnesses: Tajik Air's Chief Pilot, AmCit Ed Rhodes, and his two American pilot colleagues, in a Boeing 747SP at 41,000 feet over Kazakhstan, January 27, 1994. The cable describes a 40-minute observation:

> *"…they had encountered a UFO while flying at 41,000 feet in their Boeing 747SP at lat 45 north and long 55 east, over Kazakhstan. They first encountered the object as a bright light of enormous intensity, approaching them from over the horizon to the east at a great rate of speed and at a much higher altitude than their own. They watched the object for some forty minutes as it maneuvered in circles, corkscrews and made 90-degree turns at rapid rates of speed and under very high G's."*

Captain Rhodes took photos with a pocket Olympus, which the cable promises will be forwarded to the Embassy and to "the Tajikistan Desk (Lowry Taylor) in the Department, if they come out."

Then comes the conclusion that I keep re-reading:

> *"…SEEMED TO SUPPORT, THAT THE OBJECT WAS EXTRATERRESTRIAL AND UNDER INTELLIGENT CONTROL."*

This is a State Department cable — formal Reference / TAGS / DTG / drafting officers — concluding, on the basis of three American commercial pilots' first-hand observation, that an object was *extraterrestrial and under intelligent control*. Not someone else's framing being reported. The cable's own framing.

What the lore audience already knows: the EBE inference, in formal diplomatic prose, from a primary US source, in 1994. **Strong** that it was written; **Suggestive** about what its release in 2026, after 32 years on someone's hard drive, signals about the State Department's posture.

One detail that didn't make headlines but should: the cable's INFO routing list includes `CIA WASHDC 0224` and `DIA WASHDC 0232`. The intelligence community received this cable in 1994. We'll come back to that in §5 when we talk about IC absences.

### §3.3 — Embassy Mexico City, September 2023

The manifest titles this record *"State Department UAP Cable 5, Mexico, September 16, 2003"*. The cable's own metadata says *"Date/DTG: Sep 16, 2023 / 160150Z SEP 23"* and bears the MRN `23 MEXICO 2544`. The "2003" is a year typo in the manifest — the gov fat-fingered the decade. Watch it; we'll return to it in §6 when we read the manifest itself as a process artifact.

The cable is a *Weekly Political Blotter* — Mission Mexico's routine weekly summary of political events. The bullet list:

> *"This edition of Mission Mexico's Political Blotter features:*
> *• Ebrard Challenges MORENA Election, Threatens to Leave Party*
> *• INE Names Commission Members Ahead of 2024 Election*
> *• Mexico City Security Secretary Steps Down…*
> *• Mexican Congress Hears Testimony on Alien Life"*

That last bullet is Maussan's September 12, 2023 presentation to the Chamber of Deputies — the so-called "tridactyl mummies" event that played as fringe-curiosity in US media coverage.

What's remarkable here isn't the cable. It's the *placement*. The State Department classified Maussan's testimony as routine political reporting, alongside MORENA party drama and a Mexico City personnel change. They didn't flag it as a UAP-relevant cable. The American public discourse treated the same event as borderline-disinformation. The *internal calmness* and the *external spectacle* don't match. **Suggestive.**

The cable's release-clearance signature is also visible in the OCR: *"Released in Full — John Powers, Acting-Director, US Department of State, 2/25/2026."* State signed off on this cable's full release on **February 25, 2026** — over two months before the public May 8 disclosure. **Strong.** Tucked it away for §6.

### §3.4 — Astronauts saw things, and the corpus now records that they did

The Apollo 11 Technical Crew Debriefing (July 31, 1969) is in the release. So is the Gemini 7 transcript (1965). I read both expecting boilerplate flight-procedure debrief and got something more interesting.

In the Apollo 11 debriefing, Armstrong, Aldrin, and Collins describe what they call *"the first unusual thing"* — about a day from the moon. From the OCR'd transcript:

> *"COLLINS: How'd we see this thing? Did we just look out the window and there it was?*
> *ARMSTRONG: Yes, and we weren't sure but what it might be the S-IVB. We called the ground and were told the S-IVB was 6000 miles away. […]*
> *ARMSTRONG: We were seeing all sorts of little objects going by at the various dumps and then we happened to see this one brighter object going by. We couldn't think of anything else it could be other than the S-IVB. We looked at it through the monocular and it seemed to have a bit of an L shape to it.*
> *COLLINS: Like an open suitcase.*
> *ARMSTRONG: …it certainly seemed to be within our vicinity and of a very sizeable dimension.*
> *…*
> *ALDRIN: So then I got down in the LEB and started looking for it in the optics. We were grossly misled because with the sextant off focus what we saw appeared to be a cylinder. Or really two rings.*
> *ARMSTRONG: Yes. Two rings. Two connected rings.*
> *ALDRIN: It looked like a hollow cylinder to me. […] You could see this thing tumbling…"*

A handful of things deserve reading carefully.

The crew explicitly *ruled out the S-IVB* (the Apollo third stage) — Houston confirmed it was 6,000 miles away. They observed the object through both monocular and sextant. They disagree mildly on geometry (L-shape / two connected rings / hollow cylinder) but agree on tumbling and "very sizeable dimension." This isn't a fleeting flash; it's a sustained, three-witness, instrument-aided observation of an unidentified object with active discussion across the crew about what it could be.

The lore audience knows the rumors of Apollo astronaut sightings have circulated for decades. What's new in Release 01 is that this debriefing transcript is now in the federal corpus, declassified, with the crew's own words archived.

Gemini 7's transcript (1965) carries Frank Borman's *"a bogey at ten o'clock high"* — Houston's repeated *"unidentified object"* terminology, distinct from booster, with quantitative observation: *"hundreds of little particles going by to the left out about three or four miles… they're going into polar orbit."* Lovell on the booster as a separate, simultaneous observation: *"a brilliant body in the sun against a black background with trillions of particles on it."*

These are **Strong** as documentation. What's **Suggestive** is the choice to release them in this batch.

### §3.5 — The COMETA report

Record 19 is, as far as I can tell, the strangest single inclusion in Release 01.

The file is *UFO's and Defense: What Should We Prepare For?* — a translation of *Les OVNI et la Défense: A quoi doit-on se préparer?*, a 1999 report from France's COMETA association, an independent group of senior French officials and scientists organized via the *Institut des Hautes Études de Défense Nationale*. It is, explicitly, a foreign civilian analytical document, not a US government one.

It treats Roswell with two appendices: *"Roswell: indisputable facts"* and *"Appendix 5 — The Roswell Affair — Disinformation."* It defines EBEs (Extraterrestrial Biological Entities) as a working term. It names Bennewicz directly:

> *"Army and extraterrestrials baptized EBEs, Extraterrestrial Biological Entities. Bennewicz disclosed this information to American saucerists…"*

Anyone in the lore audience knows what that means. Paul Bennewicz was the Albuquerque engineer documented (in Greg Bishop's *Project Beta*, in Mark Pilkington's *Mirage Men*, and in declassified AFOSI history) as the deliberate target of a Defense Department / AFOSI disinformation operation in the early 1980s — the Aviary affair, Richard Doty, the whole thing. The COMETA report catalogues that operation as part of its analysis of Roswell-era disinformation.

So: a French civilian analytical document that explicitly catalogues US government disinformation operations against US citizens, bound into a US government UAP disclosure release. That's a procedural choice. **Suggestive** — the meta-move surfaces the Aviary affair as a kind of footnoted precedent, whether intentionally or because nobody on the curation side flagged what the doc actually says.

It's also the only record in the corpus that mentions the word *implant*. **Strong**, and worth noting on its own.

### §3.6 — The Pentagon institutionalized the question

Forty-one of the modern Department of War Mission Reports in Release 01 use an identical structured intake form. Every one of them includes these two fields:

> *"UAP Anomalous Characteristics/Behaviors:"*
> *"UAP Under Intelligent Control (yes/no; if yes, describe…)"*

The form is the same across CENTCOM, INDOPACOM, AFRICOM, NORTHCOM, the Department of the Army, and the Department of the Air Force. Range Fouler Debrief Forms layer on additional structured fields about munitions safety and ranges of fire.

I want to draw the distinction sharply here. We don't have, in Release 01, a single Mission Report whose answer to *"UAP Under Intelligent Control"* is visible as a clear *"yes"* with extended description. What we have is the *form* — the institutionalized question. The Pentagon, at standards-of-practice level, asks every reporting unit to characterize whether the observed phenomenon was under intelligent control.

That alone is the signal. **Strong** for the form's existence. **Suggestive** about what the form's existence implies about the Pentagon's working hypothesis space.

### §3.7 — The 1947-2026 continuity thread

What I didn't expect, going in, was how legible the *continuity* between 1947 and 2026 turns out to be in the corpus.

The "weather balloon / cosmic ray balloon" cover narrative — the Project Mogul-era story that ran in newspapers in 1951 — is documented in real time in the FBI file. Sections 5, 6, and 7 contain language about *"Liddel is sponsoring the cosmic experiments"* and *"large numbers of meteorological and cosmic ray balloons for experimental purposes."* That's Dr. Urner Liddel — the Navy physicist who publicly attributed UFO sightings to skyhook / cosmic-ray balloons in 1951. The FBI's case file shows them tracking the public narrative being deployed, in parallel to actual investigation. **Suggestive.**

The Bennewicz / AFOSI thread shows up in COMETA cross-referenced against the FBI's filed material on civilian UFO researchers (Donald Keyhoe, Frank E. Stranges, Bryant Reeve's *The Advent of the Cosmic Viewpoint* — \$6.15, says the FBI's price annotation).

Eleven records reference *underwater* / *USO* / *sub-surface* observations. That's the canonical fourth-medium thread. The release catalogues it without leaning into it. **Open** whether that's deliberate or just the slice of records that happened to clear review first.

The implication that runs across these threads — and this is **Suggestive**, not strong — is that the government has been simultaneously running cover narratives *and* internally tracking those cover narratives for decades. Release 01 is, in part, the government declassifying its own historical PSYOP self-awareness.

---

## §4 — Layer 2: metadata and forensic fingerprints

By day two I'd stopped reading PDFs and started reading EXIF.

Every digital file carries a manufacturing chain. The exiftool runs and PDF info-dict reads I did across the corpus exposed tooling choices, processing pipelines, and timing the documents themselves don't advertise.

### §4.1 — Adobe Illustrator 30.1 on every Apollo VM image

All twelve NASA Apollo VM image files in the release — six full-resolution JPEGs and their six thumbnails — carry the same EXIF software field: `Adobe Illustrator 30.1 (Windows)`.

The image captions on the public web site explicitly tell you that *"the yellow box contains an enlarged area of the original photo in which three lights are visible above the lunar terrain"* — so the Illustrator pass is annotation work. Vector overlay; box drawn; saved out. That's all I can confirm from the metadata. **Strong.**

What I can't confirm from metadata is whether anything *else* was modified — color correction, tonal adjustment, content-aware cleanup. The Illustrator metadata tells you the file went through Illustrator, not what was done in Illustrator. **Open.** A pixel-level comparison against archival NASA originals (which exist; NASA's image archive has these photos at higher resolution) is the way to settle that.

For a lore audience that's spent decades arguing about whether Apollo-era astronaut sighting imagery is authentic in any sense: the official imagery in the disclosure has been touched by a vector-graphics editor. It's not raw. That's a thing you should know.

### §4.2 — The four-step NASA PDF manufacturing chain

The PDF info dicts on the Apollo and Skylab debriefing PDFs reveal a four-step pipeline:

1. **HP 9100C Digital Sender** — listed as creator on multiple NASA PDFs. The HP 9100C is a 1990s-2000s networked document scanner. Original paper was scanned on it.
2. **macOS 26.4 Quartz PDFContext, AppendMode 1.1** — listed as producer. AppendMode is what Mac Preview writes when you concatenate multiple PDFs. Someone on a modern Mac merged the scanned outputs.
3. **Adobe Acrobat 26 Paper Capture Plug-in** — listed as producer on 28 records. That's Adobe's OCR layer — paper-to-searchable-PDF.
4. **AES-256 encryption with `print:yes copy:no change:no addNotes:yes`** — applied at release.

The lifecycle here is roughly twenty-five years of tooling. Paper archive scanned on 1990s-2000s hardware, sat in storage, prepared for release on 2026 Mac/Acrobat infrastructure. **Suggestive.**

### §4.3 — The release-morning PowerPoint

`western_us_event_slides_5.08.2026.pdf`. PDF Creator: `Microsoft® PowerPoint® for Microsoft 365`. PDF created at `Fri May 8 06:46:59 2026 EDT`.

That's the morning of public disclosure. The deck is four pages. **Strong** as fact; **Suggestive** as the cleanest available evidence that Release 01 had a coordinated press component prepared the same day it dropped.

### §4.4 — One PDF created in 2002

The corpus has one outlier. Exactly one PDF carries `pdf_created_at: Mon Mar 11 07:00:48 2002 EST`. Twenty-four years before its release.

That's a single concrete data point for *"this isn't new; it's been on a hard drive somewhere for a long time."* I can't tell you what was happening in that office on March 11, 2002 — but the file's been sitting there, untouched, ever since. **Strong.**

### §4.5 — 109 of 116 PDFs ship with copy-restrictions

109 of 116 PDFs in Release 01 ship encrypted with AES-256 and the permission flag `print:yes copy:no change:no addNotes:yes`.

The encryption is trivially defeated by `qpdf --decrypt`. I did it with one shell command. The encryption isn't security; it's *friction* — it slows down anybody who wants to bulk-extract text without inconveniencing anybody who wants to read the PDF in Preview.

The lore audience has a working hypothesis about why declassified-but-frictioned documents exist: they're released into a procedural box where the *form* of full release has been performed without enabling the kind of analysis the release ostensibly invites. **Suggestive.** (The good news, as I learned by writing this paper, is the friction cost is approximately five seconds. The form-vs-function distinction, though, is real.)

### §4.6 — DVIDS strips video metadata

All 28 videos in Release 01 are hosted on DVIDS — the Defense Visual Information Distribution Service. DVIDS' upload pipeline strips camera and encoder fingerprints. Across all 28, I cannot tell you what camera shot them, what aircraft they were on, or what GPS position they were at, *from the video file alone*.

The document text gives you that information at the narrative level: a Mission Report's body text says CENTCOM, gives you a rough geographic theater, sometimes names the platform. The *file metadata* gives you none of it. That's a deliberate redaction policy across the entire video set. **Strong.**

One outlier worth noting: D35 (Greece, October 2023) is at 800×444 resolution; all 27 other videos are 1920×1080. **Open** whether that's source-side (sensor / cropped frame) or processing-side (downscale).

---

## §5 — Layer 3: absences

By day three I was making notes about what wasn't there. Some of those absences are louder than the things that *are* there.

### §5.1 — The post-2017 modern thread is missing

I ran FTS5 keyword searches against the full-text index for a list of canonical modern UAP-discourse terms. Hits, across the entire corpus:

| Term | Hits |
|---|---|
| Tic Tac | 0 |
| Gimbal (the UAP video) | 0 (only mechanical gimbals) |
| Go Fast | 0 |
| AATIP | 0 |
| AAWSAP | 0 |
| Bigelow | 0 |
| Skinwalker | 0 |
| transmedium | 0 |
| Grusch | 0 |
| Schumer | 0 |
| Wilson memo | 0 |
| Eric Davis | 0 |
| non-human | 1 (third-party reference inside the Mexico cable) |

Release 01 covers 1947-1968 (FBI), 1965-1973 (Apollo / Skylab / Gemini), 1985-2004 (DoS cables across PNG / Tajikistan / Tbilisi / Turkmenistan), 1999 (COMETA), 2002 (the outlier), and 2020-2026 (Mission Reports + the release-morning briefing deck).

The release deliberately routes *around* the most-discussed five years of UAP discourse — roughly 2017 through 2023, the AATIP-disclosure-into-Grusch-hearing arc that drove most of the public conversation. **Suggestive.**

### §5.2 — Agencies absent — but only as authors

The corpus has no documents authored by CIA, NRO, NSA, or DIA. That was the headline I had in my notes through day three.

Then I read the Dushanbe cable's INFO routing list: `CIA WASHDC 0224, DIA WASHDC 0232`. State filed the cable in 1994 *to* the intelligence community as an information addressee. CIA and DIA received it. They received Maussan-cable-style routine cables for decades. They were *on the distribution lists*.

So the precise statement is: in Release 01, the IC is absent as authors but present as recipients. **Strong** for the distribution-list observation; **Open** for the meaning.

There are at least four readings of why no IC-authored docs appear:

1. The IC is gating its own contributions and they will land in a future release.
2. The IC declined to participate in this batch.
3. The IC genuinely doesn't have many UAP-authored documents (the cable-recipient pattern tells you they had information; that's not the same as having authored documents).
4. IC artifacts are being routed to a different release vehicle entirely (i.e., not war.gov).

**Open.** Release 02 will start to disambiguate.

### §5.3 — Forensic absences

Zero GPS coordinates in any image or video EXIF in the corpus. Zero camera make/model fingerprints on any DVIDS video. **Strong** as fact.

The geographic-and-instrument signal in this release is given *exclusively* at the document-text level. Mission Reports tell you, in prose, that an observation happened over the Strait of Hormuz. The video associated with that Mission Report does not tell you, at the file-metadata level, where it was shot or what shot it. The two channels (text vs metadata) are decoupled by policy. **Strong** as policy claim about the redaction pipeline.

### §5.4 — "Tens of millions" — what's being saved

The Department of War's directive announcing the disclosure said the government would be reviewing "tens of millions of records" and releasing them on a rolling basis. Release 01 contains 158 records. That's roughly 0.001% of the named universe.

Read the curation pattern: 1947 FBI file (historical legitimacy), Apollo crew debriefings (long-rumored thread now formally on record), COMETA (foreign analytical authority), 41 modern Mission Reports (institutional contemporary process), and a release-morning PowerPoint (managed media rollout). What's *missing* — the post-2017 institutional thread — is exactly what the lore audience cares about most.

The simplest reading: Release 01 establishes historical legitimacy and a contemporary process. The contested modern artifacts — Tic Tac, Gimbal, Go Fast, AATIP/AAWSAP institutional history, Grusch's testimony, the Wilson memo — are presumably the headline content of Release 02 or 03. **Suggestive.**

I've put falsifiable predictions about that in §9.

---

## §6 — Layer 4: process artifacts

By day four I was watching the redaction pipeline leak signal it didn't mean to leak.

The most interesting documents in this whole corpus, from a forensic standpoint, are three Mission Reports nobody can read.

### §6.1 — The 2020 Middle East corruption cluster

Three Mission Reports in Release 01 are *broken*. Not symbolically. Literally — they don't parse.

- D63: *Mission Report, Strait of Hormuz, October 2020*
- D64: *Mission Report, Iran, November 2020*
- D65: *Mission Report, Persian Gulf, July 2020*

All three are 2020 Middle East mission reports. All three carry an identical PDF malformation: `Unterminated string`, `Catalog dictionary does not contain a valid Pages entry`, `Dictionary key must be a name object`. They render in macOS Preview but `pdfinfo`, `pdftotext`, and `pdftoppm` — three different poppler-based tools — all reject them.

I had to bolt a ghostscript-based fallback onto my pipeline to recover the text. `gs -sDEVICE=pdfwrite` rewrites them through ghostscript's more permissive parser into a form poppler accepts; from there, OCR works normally.

Once the OCR ran, the recovered content was just... routine. Mission narratives, classification stamps, "OBSERVED 1X UAP" at specific timestamps. Nothing that looks like censorship-via-corruption.

But the *malformation itself* is the data point. **Identical malformation across three documents from the same era and same theater is a redaction-tool fingerprint, not random corruption.** Other 2020-era reports in the corpus survived intact and parse fine. So *only some artifacts* ran through the broken pipeline. **Suggestive.**

The lore-canon read: the disclosure pipeline isn't a single tool. There's at least one redaction workflow in the federation that produces malformed PDFs as output — used on a specific subset of documents from a specific era and theater. **Open** what that workflow was, and what *else* ran through it that may not yet have surfaced.

### §6.2 — The manifest CSV is hand-built

The CSV manifest at `war.gov/Portals/1/Interactive/2026/UFO/uap-csv.csv` — the index of the disclosure — is sloppy in ways a database export wouldn't be:

- Year typo: *"State Department UAP Cable 5, Mexico, September 16, 2003"* is, by the cable's own internal metadata (`Date/DTG: Sep 16, 2023 / 160150Z SEP 23`), September 16, **2023**. Someone typed `03` for `23`.
- Duplicate rows: D32 (Syria, October 2024) appears three times; D23 (UAE, October 2023) appears twice. Byte-identical.
- Trailing-space `Type` column values (`"PDF"` versus `"PDF "`).
- URLs containing literal commas (`dow-uap-d32-mission-report,-syria-october-2024.pdf`) — URL-legal but unsanitized.

A clean database export does not produce these artifacts. The manifest is hand-built or hand-edited. **Suggestive.**

The implication isn't sinister — it's procedural. There is no central UAP records database that produced this manifest. It was assembled — probably by humans, probably under deadline pressure, possibly by multiple teams in different agencies whose CSV-row conventions don't line up. The federation is at the boundary between a structured archive and a manual roll-up.

That matters because Release 02 won't necessarily be schema-compatible with Release 01. Each batch may carry whatever data-quality drift its assemblers produce.

### §6.3 — The uniform 2045 declassification clock

Almost all Mission Reports in the corpus carry declassification date `20450301` — March 1, 2045. Forty-one of them carry the CENTCOM stamp *"Approved for Release to AARO — FOUO/PA applies 03/16/26."*

A uniform secrecy intent set decades into the future was *pulled forward* by a single coordinated review. **Suggestive.** Release 01 isn't a release in the legal sense of artifacts naturally aging out of classification — it's the manifest of a deliberate pull-forward decision made in early 2026, applied across a CENTCOM-stamped batch with a 2045 sunset clock.

### §6.4 — Internal release dates lead public disclosure by months

State Department cables in the corpus carry release-clearance signatures dated **2/25/2026**:

> *"Released in Full — John Powers, Acting-Director, US Department of State, 2/25/2026"*

The CENTCOM stamps are dated **3/16/2026**. Public disclosure: **5/8/2026**.

Release 01 is not a single moment. It's a multi-stage clearance pipeline where each agency reviews and clears its own contributions, and the public disclosure date is the merge point. State cleared its piece roughly ten weeks before the merge; CENTCOM cleared its piece roughly seven weeks before. **Strong** as fact; **Suggestive** about the federation's working timeline for Release 02.

---

## §7 — Intersections: what no single layer can show

The four layers are useful framing. The actual signal is at the intersections.

### §7.1 — COMETA × federation × the absent word *implant*

COMETA is foreign-civilian (content layer) + bound into a US gov release (process layer) + the only document in the entire corpus to mention *implant* (absence layer; the term appears nowhere else).

The combination implies the US government valued external civilian analysis of its own historical disinformation operations enough to bind that analysis into a federal release. The Aviary affair surfaces by proxy. Whether intentionally — *yes, we know what the Bennewicz operation was, here's a French study saying so, we're putting it in the box* — or because nobody on the curation side flagged what the doc actually says, the doc is *in the box*. **Suggestive.**

### §7.2 — The 2020 Middle East corruption × the institutionalized form × the missing Tic Tac

The 2020 Middle East corruption cluster is the most temporally contemporaneous content (process layer) + uses the institutionalized "UAP Under Intelligent Control" form (content layer) + omits the famous Navy Tic Tac / Gimbal / Go Fast videos (absence layer).

Release 01 prefers *structure over salience*. The formal mechanism — the intake form, CENTCOM's review chain, the federation's clearance dates — is shown. The iconic artifacts that drove modern public discourse are withheld. **Suggestive.**

### §7.3 — Apollo Illustrator overlays × no GPS × no DVIDS make/model

Apollo VM images carry Illustrator metadata showing post-processing (metadata layer) + no GPS in any image or video EXIF (absence layer) + no camera make/model on any DVIDS video (absence layer).

Across two distinct workflows — NASA imagery prepared for release on 2020s Mac/Adobe stacks, and DVIDS video uploaded through the DoD's media distribution platform — geolocation and instrumentation are stripped from file metadata. The geographic and instrument signal is given *only* at the document-text level. The choice is consistent across distinct pipelines, which suggests it's policy, not coincidence. **Suggestive.**

### §7.4 — Release-morning PowerPoint × 2002 outlier × 79-year arc

The corpus has artifacts that are 24 years old at release (the 2002 PDF) and artifacts that are six hours old at release (the May 8 06:46 EDT PowerPoint deck). Both endpoints are visible in metadata.

Release 01 is curated to bridge *we have been holding this* and *we are speaking now*. The historical depth is shown — 1947 FBI, 1965 Gemini, 1969 Apollo, 1994 cable, 2002 outlier — and the same-day briefing deck is shown. The bracketing is the message. **Suggestive.**

### §7.5 — The pre-2017 / post-2020 hourglass

Content thread is rich pre-2017 (FBI, Apollo, DoS cables, COMETA, USAF launch summaries). Content thread is rich 2020+ (Mission Reports, Range Fouler Debriefs, the May 2026 release-morning deck). The 2017-2020 window — exactly the public AATIP / Tic Tac / Elizondo / Bigelow era that anchored modern UAP discourse — is the empty middle of the hourglass.

The shape itself is the signal. **Suggestive.** Whatever the curation intent, Release 01's narrative effect is to place the disclosure conversation back into a *historical* register (we have been working on this for a long time) and a *current institutional* register (we have a form for it now), routing around the era when UAP became a public-discourse phenomenon.

---

## §8 — Strong / Suggestive / Open by layer

A summary table for the reader, to make the discipline visible.

| Layer | Strong | Suggestive | Open |
|---|---|---|---|
| **Content** | FBI Section 9 internal-voice "extraterrestrial vehicles" memo (record 8); Sections 7+10 catalogue civilian publications using the term; Embassy Dushanbe 1994 cable concludes "EXTRATERRESTRIAL AND UNDER INTELLIGENT CONTROL" (record 149); Apollo 11 crew ruled out S-IVB; 41 Mission Reports carry the "UAP Under Intelligent Control" form (records 42-49, 73, 74, others) | The corpus catalogues simultaneous cover-narrative deployment and internal cover-narrative tracking from 1947 through 2026; the institutionalized form's *existence* signals a working-hypothesis shift; release of the 1994 cable in 2026 implies the State Department's posture is that this language is now publishable | Whether the institutionalized form's "yes" cases exist and were withheld; what the Apollo crew actually saw |
| **Metadata** | All 12 Apollo VM images carry Adobe Illustrator 30.1 EXIF; NASA PDFs are a 4-step manufacturing chain; release-morning PowerPoint timestamp; 109/116 PDFs soft-encrypted; DVIDS strips camera fingerprints from all 28 videos | The Illustrator pass on Apollo imagery is annotation-only based on metadata, not a content claim; soft encryption is friction-not-security | Whether Apollo images were modified beyond yellow-box overlay (requires pixel-level comparison against archival NASA originals); D35's 800×444 resolution outlier |
| **Absence** | Zero hits for Tic Tac/Gimbal/Go Fast/AATIP/AAWSAP/Bigelow/Skinwalker/transmedium/Grusch/Schumer/Wilson/Eric Davis; zero GPS in any EXIF; zero camera make/model on DVIDS | Modern post-2017 thread saved for later releases; geographic/instrument signal is policy-stripped from metadata | Whether IC absence is gating, refusal, genuine non-holding, or routing to a different release vehicle |
| **Process** | 3 Mission Reports (D63/D64/D65 — all 2020 Middle East) share identical PDF malformation; manifest CSV is hand-built (year typo, duplicate rows, trailing-space, unsanitized commas); uniform 2045-03-01 declassification clock; State cable internal-release dates (2/25/2026) and CENTCOM stamps (3/16/2026) lead public release (5/8/2026) | A specific 2020-era Middle East redaction pipeline produced broken output; Release 01 is the manifest of a coordinated pull-forward of a 2045 secrecy clock; federation is hand-assembled | What the broken pipeline was and what else ran through it |

Verification: every claim in this table can be checked by re-running the pipeline (`pnpm refresh`) and querying `data/disclosure.db`. The whitepaper-internal record IDs map to the SQLite `record.id` column. The file paths under `data/files/release_1/` are stable. Appendix A has the reproduction notes.

---

## §9 — Falsifiable predictions for Release 02+

A four-layer reading produces specific testable predictions about what subsequent releases should contain. I'm putting them on the record here so they can be confirmed or refuted later.

1. **The post-2017 Navy artifacts will land in Release 02 or 03.** Tic Tac, Gimbal, Go Fast — plus the AATIP / AAWSAP institutional history — will appear in subsequent batches. *Falsified if* multiple subsequent releases continue to omit them while expanding pre-2017 coverage.

2. **An IC-authored thread will appear within the first three releases.** CIA, DIA, NRO, or NSA records. *Falsified if* the staging pattern continues to route around the IC entirely. (Recall §5.2: the IC is *on the distribution lists* in Release 01. The question is whether they author into the public record.)

3. **The 2020 Middle East corruption fingerprint will recur.** Additional documents from the same era and theater will exhibit the same malformation. *Falsified if* the malformation appears outside that era/theater, or if no additional 2020-ME docs appear at all.

4. **The institutionalized form's "Under Intelligent Control: yes" cases exist and will surface.** *Falsified if* subsequent Mission Report releases continue to route around any "yes" answer. (This is the prediction I'd most like to be falsified, because the form's existence with no recovered "yes" answer would be its own data point.)

5. **A subsequent release will include underwater / USO material at higher density than Release 01's quiet 11 records.** *Falsified if* USO references stay flat or decline.

6. **Release 02's manifest will be a database export, not a hand-built CSV.** Or it will be a hand-built CSV, with similar drift patterns. *Falsified if* the manifest is clean; *suggestively confirmed* if duplicate-row / typo / trailing-space patterns recur.

7. **The Wilson memo, the Grusch testimony, and Eric Davis's briefing materials will appear within the first five releases.** *Falsified if* they remain absent through five batches.

8. **Release-morning briefing decks become a recurring artifact pattern.** Each release will be accompanied by a same-day-created briefing PDF visible in metadata. *Falsified if* subsequent releases land without one.

If you're tracking this paper later: every one of these predictions is testable against a future war.gov release plus the same pipeline (`pnpm refresh` against the new release ID).

---

## §10 — What was actually released

Three closing observations, then I'll leave you alone.

The four-layer thesis has worked, for me, as a reading method: every claim in this paper survives independent verification on at least one of content, metadata, absence, or process, and the most informative claims survive across multiple layers at once. The intersections aren't decoration; they're where the strongest patterns actually live.

I want to be specific about what I have and haven't claimed. I have not claimed the Phenomenon is non-human. I have not claimed any of the artifacts in this corpus prove ETH or NHI. I have *catalogued* what the government wrote — *extraterrestrial origin* / *extraterrestrial animals* / *extraterrestrial vehicles* / *EXTRATERRESTRIAL AND UNDER INTELLIGENT CONTROL* — and where, and under what authorial voice. I have catalogued what's missing. I have catalogued what the metadata reveals. The discipline is real, and I've tried to keep the voice and the evidence-rules visible.

Here's the curation reading I keep coming back to. 158 records of "tens of millions" is a deliberate sample. The shape of that sample — a 79-year historical spine running from Maury Island to a release-morning PowerPoint, a foreign civilian analytical document bound into a US federal release, an institutionalized contemporary intake form, a missing 2017-2020 middle, a hand-built manifest, a CENTCOM-stamped batch with a uniform 2045 declassification clock pulled forward — describes a release strategy more clearly than any single document does.

Release 02 will tell us whether the strategy continues.

---

## Appendix A — Reproducibility

The corpus is regeneratable. The pipeline that produced every claim in this paper lives in `apps/{downloader,indexer,classifier}` and `packages/shared` in this repo. Run it:

```sh
pnpm install
brew install poppler qpdf tesseract ghostscript
pnpm refresh
```

That sequence downloads every file from war.gov and DVIDS through real Chrome (Akamai blocks every other client), decrypts the soft-encrypted PDFs, OCR'd the scans (200 dpi for >50-page docs, 150 dpi otherwise), runs ghostscript-rewrite on the 3 corrupted Mission Reports, extracts EXIF/Info-dict metadata via exiftool, and applies the keyword classifier. The end state is `data/disclosure.db` and the file mirror under `data/files/release_1/`.

Every claim in this paper cites a `record.id` and a file path. The SQL queries that retrieve the cited evidence:

```sql
-- Tier breakdown
SELECT json_extract(value, '$.tier') AS tier, COUNT(*) AS records
FROM user_record_meta WHERE key='classification' GROUP BY tier;

-- T1 records
SELECT r.id, r.title FROM record r JOIN user_record_meta urm ON urm.record_id=r.id
WHERE urm.key='classification' AND json_extract(urm.value,'$.tier')='T1';

-- Free-text search (FTS5)
SELECT f.id, f.local_path, snippet(file_text_fts,0,'<<','>>','...',12)
FROM file_text_fts JOIN file f ON f.id=file_text_fts.rowid
WHERE file_text_fts MATCH 'extraterrestrial';
```

## Appendix B — Methodology and limitations

Automated extraction with `pdftotext`, `tesseract`, `exiftool`, and `pdfinfo`. Full-text search via SQLite FTS5 with the porter unicode61 tokenizer.

OCR noise caveat: specific phrasings extracted from scans (especially the FBI 1947-68 file) carry noise and should be verified against the source PDF before external quotation. Two of the FBI quotes I cite in §3.1 — the magazine-clipped *extraterrestrial origin* and *extraterrestrial animals* passages — are visibly column-fragmented in the OCR. The Section 9 internal-voice quote is cleaner because the document is not column-set magazine layout.

Tier rules and false-positive caveats live in `apps/classifier/README.md`. The keyword spec is first-pass and has been pressure-tested against a small number of obvious traps (the porter tokenizer treating *EBE* as the same root as initials *EB.*, and the form-template *"intelligent control"* string being demoted from T1 to T2 because it's the question the form asks rather than the gov's claim). Future iterations should be expected.

## Appendix C — Glossary (corpus-internal terms only)

Lore terms (AATIP, AAWSAP, EBE, NHI, ETH, Phenomenon, Aviary, Tic Tac/Gimbal/Go Fast, Wilson memo) are not defined here — assumed audience knowledge.

- **AARO** — All-domain Anomaly Resolution Office; the modern DoD UAP analysis office that receives Mission Reports.
- **AmCit** — American citizen, in State Department cable shorthand.
- **CENTCOM / INDOPACOM / AFRICOM / NORTHCOM** — Combatant Commands geographic in scope.
- **COMETA** — *Comité d'Études Approfondies*, a French civilian analytical group operating via the Institut des Hautes Études de Défense Nationale.
- **DoW** — Department of War, the Trump administration's renaming of the Department of Defense (2025+). Used throughout because that's the corpus author.
- **DTG** — Date-Time Group, military / diplomatic timestamp format (e.g., `310258Z JAN 94`).
- **DVIDS** — Defense Visual Information Distribution Service; the DoD's media platform.
- **FOUO/PA** — For Official Use Only / Privacy Act applies. A handling caveat short of classification.
- **FTS5** — SQLite's full-text search extension, used for keyword indexing.
- **ISR** — Intelligence, Surveillance, Reconnaissance; common Mission Report context line.
- **JANAP 146** — Joint Army-Navy-Air Force Publication 146; DoD-internal UFO reporting protocol referenced in Section 9 of the FBI file.
- **LRE** — Launch and Recovery Element, military aviation context.
- **MISREP** — Mission Report, the standard form Mission Report PDFs are built around.
- **MRN** — Message Reference Number, State Department cable identifier.
- **OKAS** — abbreviation visible in Mission Reports for an unspecified operating base.
- **Range Fouler** — military aviation term for an unauthorized or unidentified entrant into an active range; the corpus contains a Range Fouler Debrief Form variant.
- **RTB** — Return to Base.
- **S-IVB** — Apollo's third-stage rocket, ruled out by Houston as the source of the Apollo 11 crew's sighting.

## Appendix D — Citation conventions

Every claim in §3 through §6 is citable via the corpus and tagged Strong, Suggestive, or Open. For external quotation: verify primary text against the source PDF in `data/files/release_1/pdfs/` before publishing. OCR'd text from scanned material may carry transcription noise that should be reconciled against visual inspection of the source.
