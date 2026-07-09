# Dashboard Agent Handoff

Tento dokument je určený pro dalšího agenta / vývojáře, který má funkčnost z
tohoto repa zakomponovat do současného dashboardu. Popisuje, co dnes projekt
umí, jaké má integrační hranice, kde jsou uložená data, jak fungují konektory
a co je nutné zachovat, aby integrace fungovala.

## 1. Co tenhle projekt dnes je

Repo [`Demo Agent`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent) je lokální
Next.js aplikace, která poskytuje chatové rozhraní pro analytického agenta nad
více read-only zdroji:

- PostHog
- Stripe
- Supabase
- Notion
- AMIO Conversations

Agent běží přes Azure OpenAI Responses API. Většina zdrojů je připojená jako
remote MCP tools. Výjimka je AMIO Conversations: to není MCP server, ale
lokálně implementovaná server-side function tool vrstva.

## 2. Aktuální stav v gitu

Relevantní commity na `main`:

- `eeb3609` — `feat: add amio conversations capability`
- `c6bd5f2` — `fix: expose amio health and responses schema`

Pokud bude druhý agent vycházet z jiného repa nebo monorepa, tohle jsou commity,
ze kterých byla AMIO funkcionalita odvozena.

## 3. Hlavní architektura

### 3.1 Vysoká úroveň

Tok requestu:

1. Frontend pošle uživatelskou zprávu na
   [`src/app/api/sessions/[sessionId]/messages/route.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/app/api/sessions/%5BsessionId%5D/messages/route.ts)
2. Route spustí [`agentRunner`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/agent-runner.ts)
3. `AgentRunner`:
   - uloží user message do SQLite
   - založí `agent_run`
   - streamuje odpověď z provideru
   - průběžně ukládá tool traces
   - po dokončení uloží assistant message a `lastResponseId`
4. `AzureResponsesProvider` volá Azure Responses API a dodává mu:
   - MCP tools pro PostHog / Stripe / Supabase / Notion
   - function tools pro AMIO Conversations
5. UI dostává SSE stream a vykresluje statusy, text i tool trace.

### 3.2 Kde je hlavní wiring

- Provider/container:
  [`src/features/agent/container.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/container.ts)
- Azure provider:
  [`src/features/agent/azure-responses-provider.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/azure-responses-provider.ts)
- Agent instructions:
  [`src/features/agent/instructions.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/instructions.ts)
- Connector health panel:
  [`src/features/integrations/health-service.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/integrations/health-service.ts)
  a
  [`src/components/chat/session-sidebar.tsx`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/components/chat/session-sidebar.tsx)

## 4. Rozdíl mezi konektory: OAuth vs env-only vs custom function tools

Tohle je důležité zachovat při integraci do dashboardu.

### 4.1 Notion

Notion je jediný zdroj, který je připojovaný přes OAuth.

Jak funguje:

- uživatel klikne v levém panelu na reconnect/connect
- frontend otevře route
  [`/api/integrations/notion/connect`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/app/api/integrations/notion/connect/route.ts)
- ta spustí `notionOAuthService.startAuthorization(origin)`
- callback z Notionu jde na
  [`/api/integrations/notion/callback`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/app/api/integrations/notion/callback/route.ts)
- `notionOAuthService.completeAuthorization(...)` uloží access + refresh token
- provider si při každém requestu dynamicky sahá pro validní token přes
  `notionOAuthService.getValidAccessToken()`
- pokud token existuje, Notion MCP tool se přidá až runtime do `getMcpTools`

Klíčová vlastnost:

- Notion není řízený čistě `.env.local`
- je to per-install / per-user připojení uložené lokálně v SQLite

Relevantní soubory:

- [`src/features/notion/notion-oauth-service.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/notion/notion-oauth-service.ts)
- [`src/features/notion/notion-oauth-repository.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/notion/notion-oauth-repository.ts)
- [`src/features/notion/token-crypto.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/notion/token-crypto.ts)

### 4.2 PostHog, Stripe, Supabase

Tyto konektory jsou čistě env-based.

To znamená:

- není potřeba OAuth UI flow
- konektor je aktivní, pokud jsou vyplněné příslušné env hodnoty
- health panel jen validuje konfiguraci a dostupnost zdroje

Příklady:

- PostHog vyžaduje `POSTHOG_API_KEY` a `POSTHOG_PROJECT_ID`
- Stripe vyžaduje `STRIPE_API_KEY` a očekává restricted key začínající `rk_live_`
- Supabase vyžaduje `SUPABASE_ACCESS_TOKEN` a `SUPABASE_PROJECT_REF`

### 4.3 AMIO Conversations

AMIO je taky env-based, ale ne přes MCP. Je to interní function tool vrstva.

Vyžaduje:

- `AMIO_API_BASE_URL`
- `AMIO_API_KEY`
- `AMIO_MAX_CONVERSATIONS`

Health panel pro AMIO:

- nevolá MCP discovery
- dělá přímo read-only HTTP ping přes `AmioConversationsApi.searchConversations(...)`

Relevantní soubory:

- [`src/features/agent/amio-conversations-capability.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/amio-conversations-capability.ts)
- [`src/features/amio-conversations/amio-conversations-api.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/amio-conversations/amio-conversations-api.ts)
- [`src/features/integrations/health-service.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/integrations/health-service.ts)

## 5. Kde jsou uložená data

### 5.1 Lokální historie samotného agenta

Tohle nejsou AMIO historické konverzace. To je lokální historie chatu s tímto
agentem.

Je uložená v lokální SQLite databázi přes Drizzle schema:

- [`src/db/schema.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/db/schema.ts)

Tabulky:

- `sessions`
- `messages`
- `agent_runs`
- `tool_calls`
- `notion_connections`
- `notion_oauth_states`

Správa chat historie:

- [`src/features/chat/sqlite-chat-repository.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/chat/sqlite-chat-repository.ts)

Z toho plyne:

- uživatelské otázky a assistant odpovědi tohoto agenta jsou uložené lokálně
- tool traces jsou uložené lokálně
- `lastResponseId` pro Azure multi-turn pokračování je uložené v `sessions`

### 5.2 Notion OAuth data

Notion client registration + access/refresh tokeny jsou uložené v SQLite:

- `notion_connections`
- `notion_oauth_states`

Tokeny nejsou uložené plaintextem. Šifrují se přes `token-crypto`.

### 5.3 AMIO historické konverzace

AMIO historické konverzace se dnes **neukládají** do lokální SQLite databáze.

To je zásadní:

- nejsou ingestované do lokální DB
- nejsou cachované jako trvalá data
- fetchují se živě z AMIO API při každém tool callu

Pokud bude dashboard chtít:

- cache,
- offline reporting,
- přehledy nad historií,
- nebo přímé UI zobrazení transcriptů mimo model,

musí si to přidat jako separátní vrstvu. Dnešní implementace je čistě
read-through.

## 6. Jak funguje AMIO Conversations

### 6.1 Scope

Aktuální scope je natvrdo omezený na demo bot:

- `botId = 6950785430289573256`

To je definované v:

- [`AMIO_DEMO_BOT_ID`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/amio-conversations-capability.ts)

Model ten bot ID nikam neposílá. Tool vrstva ho injectuje sama.

### 6.2 Používané endpointy

Implementace skládá data z těchto AMIO analytics endpointů:

1. `GET /analytics/conversations`
2. `GET /analytics/conversations/:contactId/history`
3. `GET /analytics/conversations/:contactId/requests`

Zdroj:

- [`src/features/amio-conversations/amio-conversations-api.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/amio-conversations/amio-conversations-api.ts)

### 6.3 Jaký je flow

1. Tool dostane filtr:
   - `dateFrom`
   - `dateTo`
   - případně `requestOutcomes`, `ignoreOutcomes`, `answerId`, `channelIds`, `textQuery`
2. `searchConversations` si stránkuje `GET /analytics/conversations`
3. Vyfiltruje kandidáty
4. U `fetch` a `analyze` toolů:
   - pro každý `contactId` dotáhne `history`
   - dotáhne `requests`
   - spojí je přes `message_id`
5. `transcript-normalizer` vrátí jednotný transcript formát
6. `conversation-search-service` případně spočítá deterministic agregace

### 6.4 Jaké tools jsou dnes k dispozici

Jsou to interní Responses function tools:

- `amio-search-conversations`
- `amio-fetch-conversation-transcripts`
- `amio-analyze-conversations-batch`

Definice je v:

- [`src/features/agent/amio-conversations-capability.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/amio-conversations-capability.ts)

### 6.5 Co vracejí

#### `amio-search-conversations`

Vrací jen:

- `contactIds`
- `summary`
- `truncated`

Nevrací transcripty.

#### `amio-fetch-conversation-transcripts`

Vrací:

- `transcripts`
- `summary`
- `truncated`
- `failedContactIds`
- `warnings`

#### `amio-analyze-conversations-batch`

Vrací:

- `contactIds`
- `summary`
- `transcripts`
- `aggregate`
- `truncated`
- `failedContactIds`
- `warnings`

### 6.6 Jak vypadají transcript messages

Normalizer převádí AMIO eventy na jednotný tvar:

- `user` / `assistant` / `system`
- `text`
- `button_click`
- `remote_action`
- `llm_action`
- `event`
- `answer_end`

Mapování:

- `direction=received` -> `user/text`
- běžný outbound message -> `assistant/text`
- `quick_reply` a `postback` -> `user/button_click`
- `remote_action` -> `system/remote_action`
- `chat_gpt_action` -> `system/llm_action`
- `event` a `bot_wake_up` -> `system/event`
- `answer_end` -> `system/answer_end`

Zdroj:

- [`src/features/amio-conversations/transcript-normalizer.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/amio-conversations/transcript-normalizer.ts)

### 6.7 Důležitá omezení

- `dateFrom` a `dateTo` jsou povinné
- konverzace lze omezit jen počtem, ne zkrácením zpráv
- transcript se nikdy nekrátí po message count
- systémové eventy lze vypnout přes `includeSystemEvents`
- search má lokální `textQuery` filtr jen nad `initialRequest`

## 7. Jak je AMIO zapojené do Azure provideru

Tohle je netriviální a při integraci do dashboardu to nesmí zmizet.

### 7.1 Většina zdrojů = MCP

PostHog / Stripe / Supabase / Notion se do Azure posílají jako `tools: [...]`
typu MCP.

### 7.2 AMIO = function tools

AMIO se posílá jako `type: "function"` tool. Provider obsahuje malý lokální
tool loop:

1. Azure vrátí `function_call`
2. Provider najde tool podle jména
3. Provider lokálně spustí callback
4. Provider pošle zpět `function_call_output`
5. Azure pokračuje ve streamu dál

To je implementované v:

- `maybeExecuteFunctionTool(...)`
- `buildResponseTools(...)`

v souboru:

- [`src/features/agent/azure-responses-provider.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/azure-responses-provider.ts)

Pokud druhý agent bude AMIO integrovat do jiného dashboardu, musí zachovat
jednu z těchto variant:

1. buď zachová stejný lokální function tool loop,
2. nebo AMIO přepíše do vlastního MCP serveru,
3. nebo tool orchestration udělá úplně mimo Responses tooling.

Bez toho AMIO nebude pro model volatelné.

## 8. Integrations panel vlevo

Levý panel v UI ukazuje health každého zdroje.

Tok:

1. frontend volá [`getIntegrationsStatus()`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/lib/integrations-api.ts)
2. to jde na `/api/integrations`
3. route volá `getIntegrationsHealth()`
4. ten vrátí seznam `ConnectorHealth[]`
5. `SessionSidebar` to vykreslí

Relevantní soubory:

- [`src/lib/integrations-api.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/lib/integrations-api.ts)
- [`src/app/api/integrations/route.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/app/api/integrations/route.ts)
- [`src/features/integrations/health-service.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/integrations/health-service.ts)
- [`src/components/chat/session-sidebar.tsx`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/components/chat/session-sidebar.tsx)

Connector status typy:

- `checking`
- `connected`
- `disconnected`
- `misconfigured`

Rozdíl:

- `misconfigured` = chybí env / OAuth setup
- `disconnected` = config existuje, ale health check neprošel

## 9. Environment konfigurace

Klíčové env proměnné:

- Azure:
  - `AZURE_OPENAI_ENDPOINT`
  - `AZURE_OPENAI_API_KEY`
  - `AZURE_OPENAI_DEPLOYMENT`
- PostHog:
  - `POSTHOG_API_KEY`
  - `POSTHOG_PROJECT_ID`
  - `POSTHOG_ORGANIZATION_ID`
- Stripe:
  - `STRIPE_API_KEY`
- Supabase:
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_REF`
- AMIO:
  - `AMIO_API_BASE_URL`
  - `AMIO_API_KEY`
  - `AMIO_MAX_CONVERSATIONS`

Template:

- [.env.example](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/.env.example)

Poznámka:

- pokud chybí `AMIO_API_KEY`, AMIO se nezapne do provideru
- zároveň bude v health panelu jako `misconfigured`

## 10. Co je potřeba udělat při integraci do současného dashboardu

Tohle je praktický checklist.

### 10.1 Zachovat server-side secret boundary

Nesmí se stát, že:

- `AMIO_API_KEY`
- Stripe key
- Supabase PAT
- Notion refresh token

protečou do klienta.

Všechny tyto zdroje jsou dnes server-side only.

### 10.2 Rozhodnout, kde poběží agent runtime

Druhý agent si musí vybrat jednu variantu:

1. Přenese celé agent runtime do dashboardu
   To znamená Azure Responses provider, chat persistence, tool loop, integrations health.

2. Udělá z tohoto projektu interní backend službu
   Dashboard by ho pak jen volal.

3. Přenese jen AMIO část
   a zbytek dashboard už řeší vlastním agent frameworkem.

Pokud dashboard už má vlastní agent orchestraci, třetí varianta může být
nejjednodušší, ale musí znovu vyřešit:

- function tool registration
- transcript normalizaci
- AMIO health check
- env config

### 10.3 Rozhodnout, co se má stát s lokální SQLite historií

Dnes je lokální chat historie uložená v SQLite. V dashboardu bývají obvykle
jiné persistence standardy.

Je potřeba rozhodnout:

1. ponechat SQLite jen pro lokální/dev režim
2. přepsat persistence do dashboard DB
3. agent history vůbec nepřenášet a řešit jen tool integraci

### 10.4 Zachovat rozdíl mezi Notion OAuth a ostatními zdroji

Tohle je častá integrační chyba.

Notion:

- potřebuje OAuth routes
- potřebuje per-install token storage
- potřebuje refresh flow

Ostatní zdroje:

- nepotřebují OAuth UI
- jsou založené na env configu

AMIO:

- je env-based
- ale není MCP

### 10.5 Zachovat AMIO fixed bot scope

Dnešní implementace je pinned na demo bot ID. Pokud dashboard chce multi-bot
podporu, musí to být explicitní další změna.

Bezpečný první krok je zachovat:

- fixed `botId=6950785430289573256`

### 10.6 Pohlídat OpenAI Responses schema omezení

Responses API v téhle implementaci vyžadovalo, aby tool schema nepoužívalo
holé `.optional()` na properties. Proto jsou hodnoty v Zod schema nastavené
jako `.nullable()` a následně se sanitizují v kódu.

To je konkrétní detail, který už jednou způsobil runtime pád. Při přepisu
schema do jiného prostředí je potřeba na to myslet.

## 11. Známé hrany a praktické poznámky

### 11.1 Dev server port

Při lokálním vývoji se někdy rozjel starý `next dev` proces na jiném portu
(`3000` vs `3002`). Pro dashboard integraci to není architektonicky důležité,
ale při lokálním testování je potřeba koukat na aktuální běh.

### 11.2 Full repo test suite není úplně zelený

Fokusované testy pro AMIO capability, provider a env prošly, ale v průběhu
prací byly v repu vidět i nesouvisející starší pády v některých UI/API testech.

Pro integraci AMIO je důležité hlavně:

- provider tests
- amio api tests
- transcript normalizer tests
- conversation service tests
- typecheck
- build

### 11.3 AMIO health je read-only ping, ne plný smoke test

Health panel ověřuje dostupnost search endpointu, ne že funguje celý batch flow
nad history a requests. Pokud bude dashboard chtít tvrdší health, musí přidat
speciální smoke check.

## 12. Doporučený minimální integrační plán pro druhého agenta

Pokud má být integrace rychlá a bezpečná, doporučené pořadí je:

1. Přenést env konfiguraci a health panel contract
2. Přenést `AmioConversationsApi`
3. Přenést `transcript-normalizer`
4. Přenést `conversation-search-service`
5. Napojit AMIO jako function tools do agent runtime dashboardu
6. Ověřit:
   - search
   - fetch transcripts
   - batch analyze
   - health panel state
7. Teprve pak řešit UX a hlubší analytics nad transcripty

## 13. Nejkratší odpovědi na typické otázky dalšího agenta

### Kde jsou historické konverzace uložené?

Ne v lokální DB. Tahají se živě z AMIO API.

### Kde je uložená historie chatu s agentem?

V lokální SQLite DB, tabulky `sessions`, `messages`, `agent_runs`, `tool_calls`.

### Kde jsou uložené Notion tokeny?

Také v lokální SQLite DB, v `notion_connections`, šifrovaně.

### Které zdroje potřebují OAuth?

Jen Notion.

### Které zdroje jsou čistě přes env?

PostHog, Stripe, Supabase, AMIO.

### Je AMIO MCP server?

Ne. Dnes je to lokální Responses function tool vrstva.

### Musí se přenést i levý panel se statusy?

Nemusí, ale pokud dashboard chce parity s touto appkou, měl by zachovat stejný
contract `ConnectorHealth[]`.

## 14. Doporučené soubory k přečtení jako první

Pokud má druhý agent omezený čas, ať začne tady:

1. [`src/features/agent/container.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/container.ts)
2. [`src/features/agent/azure-responses-provider.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/azure-responses-provider.ts)
3. [`src/features/agent/amio-conversations-capability.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/agent/amio-conversations-capability.ts)
4. [`src/features/amio-conversations/amio-conversations-api.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/amio-conversations/amio-conversations-api.ts)
5. [`src/features/amio-conversations/transcript-normalizer.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/amio-conversations/transcript-normalizer.ts)
6. [`src/features/amio-conversations/conversation-search-service.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/amio-conversations/conversation-search-service.ts)
7. [`src/features/notion/notion-oauth-service.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/features/notion/notion-oauth-service.ts)
8. [`src/db/schema.ts`](/Users/tomasmarek21/AMIO/Code/Demo%20Agent/src/db/schema.ts)

## 15. Shrnutí v jedné větě

Tahle appka je lokální analytický agent nad Azure Responses API, kde
PostHog/Stripe/Supabase/Notion jsou read-only connected sources, Notion je
jediný OAuth zdroj, AMIO Conversations jsou custom function tools nad živým
AMIO analytics API a lokální SQLite drží jen historii samotného agenta a
Notion OAuth data, ne AMIO transcripty.
