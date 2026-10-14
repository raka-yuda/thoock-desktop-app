# Static text model catalogue

Checked 2026-10-14. [text-models.ts](../src/lib/text-models.ts) supplies Settings and the research, brief, and metadata dialogs. Options use the exact API ID; changing provider selects its first catalogue entry. Existing saved IDs remain visible as a saved-model option. The catalogue is curated for structured text output and image input, rather than including audio, embeddings, or image-generation endpoints.

## OpenAI

| API ID         | Official model page                                                        |
| -------------- | -------------------------------------------------------------------------- |
| `gpt-6-luna`   | [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)     |
| `gpt-6.1-sol`  | [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)   |
| `gpt-6-astra`  | [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)   |
| `gpt-6-sol`    | [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)       |
| `gpt-5.6-luna` | [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) |
| `gpt-5.6-sol`  | [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)   |

These model pages document Responses API, image input, and structured-output support. See also [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [deprecations](https://developers.openai.com/api/docs/deprecations). Account permissions and usage limits still apply.

## Gemini

| API ID                   | Catalogue label                            |
| ------------------------ | ------------------------------------------ |
| `gemini-3.5-flash-lite`  | Gemini 3.5 Flash-Lite                      |
| `gemini-3.8-flash`       | Gemini 3.8 Flash                           |
| `gemini-4-argon`         | Gemini 4 Argon                             |
| `gemini-3.6-flash`       | Gemini 3.6 Flash                           |
| `gemini-3.1-flash-lite`  | Gemini 3.1 Flash-Lite                      |
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro · Preview                   |
| `gemini-2.5-flash`       | Gemini 2.5 Flash · Existing API users      |
| `gemini-2.5-pro`         | Gemini 2.5 Pro · Existing API users        |
| `gemini-2.5-flash-lite`  | Gemini 2.5 Flash-Lite · Existing API users |

IDs and availability follow the [Gemini API catalogue](https://ai.google.dev/gemini-api/docs/models); structured-output support follows [Google's structured-output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). Google limits the 2.5 family to accounts that have used those models previously. Preview availability can change.

## Maintenance

Recheck the official catalogues and shutdown notices before changing this list. Confirm structured output, image input, and compatibility with the app's Responses/generateContent adapters. Update the checked date, IDs, labels, and provider defaults together. Selecting a model does not make an API call; this static list cannot establish which models a particular key can access. No live provider calls were made to validate this change.
