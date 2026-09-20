# S1 "Ears": what the licences actually say

> **STATUS UPDATE, 2026-09-20.** Michael contacted both Deezer and Spotify and reports
> that both said this use is fine given that permission was asked for. That resolves the
> two open questions below, and the §IV and ML-training analyses now describe what the
> terms _say_, not an unresolved exposure.
>
> Evidence class: **reported by Michael**, not a document this session read. If the
> approvals came by email or ticket, keep them — "I asked and they approved" is much
> stronger in an interview when it can be produced, and an interviewer who knows these
> terms is exactly the person who will ask. The rest of this file is unchanged, because
> the _reasoning_ is the part worth being able to state out loud.

Written 2026-09-19 for the S1 audio-student work. Every quote here was fetched from
the primary document this session. **This is not legal advice**, and where a reading
is mine rather than the document's words, it says so.

The point of this file is that Michael can state the exposure himself, out loud, before
an interviewer finds it. Three separate agreements bind this project, and the one most
people would worry about is not the one with the sharpest wording.

---

## 1. Deezer — the sharpest clause, and the easiest to miss

Deezer for Developers Terms of Use, **§IV NON-COMMERCIAL USE**, verbatim:

> "The Developer agrees that the use of the Services is strictly limited for a
> non-commercial purpose and in a non-commercial environment. It means that the
> Developer shall not perceive, receive, generate, benefit or create directly or
> indirectly, any moneys, incomes, revenues, **data** or any other consideration in
> connection with the use of neither the Services themselves, nor any and all Content
> accessed through the Services."

Read that list again: \*moneys, incomes, revenues, **data\***. Embeddings are data created
in connection with Content accessed through the Service. On a plain reading, **the thing
this project does — derive vectors from previews and keep them — is inside what §IV
forbids, and discarding the audio does not answer it.** §IV restricts generated data,
not stored audio.

What the stream-and-discard design _does_ satisfy, also verbatim:

- Guidelines: _"Local Storage/Offline Storage of audio data is strictly forbidden. If in
  some cases you need to optimize your application and store audio data, please contact
  Deezer."_ — we never write audio to disk. Compliant.
- Guidelines content table, unlogged users: _"API: 30s. extract"_ — the 30-second preview
  is the sanctioned unauthenticated access level. We take exactly that.
- §V DRM: _"undertakes not to bypass, by any means, these measures"_ — we use the signed
  `hdnea` URL exactly as returned. Stripping or re-signing the token would be a bypass;
  we do neither. (We re-request a fresh URL when one expires, which is ordinary use.)

**My assessment, flagged as mine:** academic non-commercial research is plausibly the
"non-commercial purpose" §IV contemplates, but "generate … data" is the sentence a
sharp reviewer lands on, and §IX requires any other purpose be "beforehand reviewed and
approved by DEEZER". The clean path is a written OK — the Guidelines themselves say
"please contact Deezer". **Do not answer §IV with "but we discard the audio."**

---

## 2. Spotify — the one the plan already anticipated

Spotify's Developer Terms prohibit using Platform content to train machine-learning
models (effective May 2025). The honest accounting of what this project takes from
Spotify:

| Taken from Spotify                                 | Used for                                        |
| -------------------------------------------------- | ----------------------------------------------- |
| track list, titles, artist names (cached May 2026) | the input Claude saw, i.e. the teacher's prompt |
| ISRCs (fetched 2026-09-19)                         | the join key that locates the audio on Deezer   |
| `duration_ms`                                      | the wrong-version audit                         |

**Teacher A is Claude's judgments of Spotify metadata.** The student is trained to predict
those judgments. So Spotify-derived data is the training target, not an incidental input.
That is the centre of the clause, not its edge.

Two things that are _not_ mitigations, and should not be offered as such:

- "The audio is Deezer's, not Spotify's." True, and irrelevant — the clause is about data,
  and the targets are Spotify-derived.
- "It's only metadata." The clause does not carve out metadata.

The designed mitigation is already in `STATE.md`: **use the Spotify personal data export
instead of the API.** That export is Michael's own data as a data subject, obtained through
a different route than the Developer Terms. It has not arrived; the turnaround is
UNVERIFIED and possibly weeks. Until it does, the ISRCs and the track list came from the
API.

A partial reduction available today: **ISRCs could be sourced from MusicBrainz instead**
(CC0, no such clause). That removes one Spotify dependency but not the teacher targets,
and match quality would need measuring.

---

## 3. Model licences — matters only if anything ships

| Model                    | Licence                                                 | Consequence                                                     |
| ------------------------ | ------------------------------------------------------- | --------------------------------------------------------------- |
| MERT-v1-95M              | **CC-BY-NC-4.0** (README front matter + API `cardData`) | non-commercial                                                  |
| MERT-v2-30s              | **CC-BY-NC-4.0** (LICENSE file, weights only)           | non-commercial; attribution required, naming the model and repo |
| CLAP `larger_clap_music` | **Apache-2.0**                                          | the only permissive one                                         |
| Essentia MTG models      | **contradictory** — see below                           | non-commercial either way                                       |

The Essentia contradiction is worth knowing because it is the kind of detail that reads as
diligence: `models.html` says _"All the models created by the MTG are licensed under
CC BY-NC-SA 4.0"_, while the `LICENSE` file's headline says _"Attribution-NonCommercial-
**NoDerivatives** 4.0"_ and then, two lines later, grants _"Adapt — remix, transform, and
build upon the material"_ and links the **ShareAlike** legalcode. The grant text and the URL
outvote the headline, so the operative licence is BY-NC-SA. NonCommercial binds either way.
UPF offer a proprietary licence on request.

**Practical consequence:** a student distilled from NC encoders plausibly inherits NC as
adapted material. If S3 ever ships to Replit, **serve CLAP only** — that is already the
decision recorded in the notes, and this confirms the reason.

---

## How I would say this out loud

> "Three licences bind this. Spotify's developer terms bar training on API-derived data,
> and my targets are Claude's judgments of Spotify metadata — so the clean version uses my
> personal data export instead, and that request is pending. Deezer's terms are stricter
> than people assume: §IV bars _generating data_ from their content, which on a plain
> reading covers embeddings, and 'we discard the audio' is not an answer to it. And both
> MERT encoders are CC-BY-NC, so the student inherits non-commercial. The project is
> personal, local, and unpublished, which is the lowest-exposure posture available — but I
> am not going to tell you it is clearly permitted, because it isn't."

That is a better interview answer than a reassurance, and it is the one that survives a
follow-up question.

## Decisions this leaves open for Michael

1. **Contact Deezer for written approval**, or accept §IV exposure knowingly and keep the
   work unpublished. (The Guidelines invite the contact.)
2. **Request the Spotify privacy export now** — it is already open decision #4 in
   `STATE.md`, and every week of delay is a week the clean path is unavailable.
3. **Decide whether the embeddings persist at all** after the experiment, or are deleted
   once the student is trained and the numbers are recorded.
