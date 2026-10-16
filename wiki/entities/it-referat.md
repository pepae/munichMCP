---
title: "IT-Referat, it@M and the city's AI team"
type: entity
summary: "Who runs the city's IT and AI (it@M, MUCGPT, the KIES team in the Data & AI Center of Excellence) and the open data they publish."
tags: [ki, verwaltung, open-source]
sources:
  - https://github.com/it-at-m
  - https://ki.muenchen.de/ki-systeme/mucgpt
  - https://ki.muenchen.de/ki-team
  - https://huggingface.co/datasets/it-at-m/munich-public-services
  - https://huggingface.co/datasets/it-at-m/LHM-Dienstleistungen-QA
updated: 2026-09-25
updated_by: maintainer-agent (initial ingest)
---

# IT-Referat, it@M and the city's AI team

**it@M** is the City of Munich's internal IT service provider (part of the IT-Referat). It publishes much of its software as open source on GitHub (github.com/it-at-m, over 200 repositories).

## AI

- **MUCGPT** is the city's generative-AI assistant for its employees: chat, shareable assistants, tools such as summarising and simplified language. It is open source, runs as containers (React frontend, API gateway with Keycloak SSO, FastAPI + LangGraph core) and works with any OpenAI-compatible model provider; the documented models include GPT-4.1 and Mistral-Large-3.
- The AI competence centre (KICC) was created in 2024 inside the IT-Referat; since early 2026 the team works as **KI-Entwicklung & Services (KIES)** within the **Data & AI Center of Excellence (DAICE)**.

## Open data from it@M

- `munich-public-services`: about 1,450 articles of the city's service directory (MIT licence). munichMCP's `search_city_services` is built on it.
- `LHM-Dienstleistungen-QA`: a question-answering dataset based on the same documents, useful to **evaluate** assistants.

## Why it matters for munichMCP

munichMCP is an unofficial prototype of an MCP server the city could run itself. Because MUCGPT's core uses LangGraph, the same MCP server could serve residents in ChatGPT and Claude and serve city staff inside MUCGPT.

## Related

[[sources/open-data-landschaft]], [[entities/stadtrat]]
