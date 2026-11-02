# Modèles locaux avec Ollama

Le bot peut utiliser des modèles servis par [Ollama](https://ollama.com) : sur votre machine, sur le réseau
local, sur un serveur dédié (GPU) ou sur le cloud d'Ollama. Les données des citoyens restent alors sur votre
infrastructure (loi 09-08), et il n'y a ni quota ni coût par token.

Le bot utilise l'**API native** d'Ollama (`/api/chat`), pas seulement son endpoint compatible OpenAI, pour :

| Réglage | Pourquoi |
|---|---|
| `format` = schéma JSON de la tâche | chaque réponse respecte le schéma, sur **n'importe quel** modèle |
| `num_ctx` (défaut 8192) | la fenêtre par défaut d'Ollama est petite et coupe en silence les longs prompts (liste des champs d'un document) |
| `keep_alive` (défaut 30 min) | le modèle reste en mémoire entre deux messages : pas de chargement à froid à chaque fois |
| `think` (optionnel) | désactiver le « raisonnement » des modèles qui pensent (qwen3, deepseek-r1…), inutile pour ces petites tâches JSON |
| `/api/show` | le bot demande au serveur si le modèle lit les images (vision) : pas besoin de `LLM_CAPS` |

## 1. Configuration

Comme pour tout autre modèle (voir [`supabase/functions/.env.example`](../supabase/functions/.env.example)) :

```bash
LLM_BASE_URL=http://192.168.1.20:11434      # /v1 ou /api à la fin sont acceptés et retirés
LLM_MODEL=qwen2.5:14b
# LLM_PROVIDER=ollama   automatique pour le port 11434 et ollama.com ;
#                       LLM_PROVIDER=openai force l'ancien endpoint /v1
# LLM_API_KEY=          seulement derrière un proxy qui le vérifie, ou pour ollama.com
# LLM_HEADERS={"CF-Access-Client-Id":"…","CF-Access-Client-Secret":"…"}   en-têtes en plus (JSON)

# Pour tous les modèles Ollama (optionnel)
# OLLAMA_NUM_CTX=8192
# OLLAMA_KEEP_ALIVE=30m        # "-1" = toujours en mémoire
# OLLAMA_THINK=false           # true | false | low | medium | high
# LLM_TIMEOUT_MS=120000        # défaut pour Ollama : 120 s (chargement, CPU)
```

Chaque rôle peut avoir son propre serveur. Par exemple, le texte en local, les images sur une machine GPU,
et Gemini en secours :

```bash
LLM_BASE_URL=http://192.168.1.20:11434
LLM_MODEL=qwen2.5:14b
LLM_VISION_BASE_URL=https://gpu.mon-domaine.ma
LLM_VISION_MODEL=gemma3:12b
LLM_VISION_API_KEY=…
LLM_FALLBACK_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_FALLBACK_API_KEY=…
LLM_FALLBACK_MODEL=gemini-3.8-flash
```

Un rôle sans `<ROLE>_BASE_URL` hérite du serveur principal, avec sa clé, ses en-têtes et son type d'API.

## 2. Où tourne le bot, et comment il atteint Ollama

> **Important** : déployée, la fonction `telegram-webhook` tourne **dans le cloud de Supabase**. Pour elle,
> `localhost` désigne son propre conteneur, et `192.168.x.x` n'existe pas. Un Ollama local doit donc être
> exposé, et protégé, ou bien la fonction doit tourner chez vous.

| Situation | `LLM_BASE_URL` | À faire |
|---|---|---|
| **A. Serveur dédié** (VPS/GPU) | `https://ollama.mon-domaine.ma` | proxy HTTPS avec clé (§3) |
| **B. PC / réseau local**, bot sur Supabase | URL du tunnel | tunnel + contrôle d'accès (§4) |
| **C. Tout en local** (développement) | `http://host.docker.internal:11434` | `supabase functions serve` (§5) |
| **D. Cloud Ollama** | `https://ollama.com` | clé API ollama.com dans `LLM_API_KEY` |

Ollama **n'a pas d'authentification** : n'ouvrez jamais le port 11434 sur Internet sans proxy devant.

## 3. Serveur dédié : Ollama derrière Caddy, avec une clé

Sur le serveur :

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:14b
ollama pull gemma3:12b            # si vous voulez la lecture de CNIE / photos
# Ollama écoute sur 127.0.0.1:11434 (défaut) : seul Caddy y accède.
```

`/etc/caddy/Caddyfile` (certificat HTTPS automatique) :

```caddy
ollama.mon-domaine.ma {
	@authorized header Authorization "Bearer {env.OLLAMA_PROXY_KEY}"
	handle @authorized {
		reverse_proxy 127.0.0.1:11434 {
			header_up Host localhost:11434
		}
	}
	respond 401
}
```

Ensuite, côté Supabase : `LLM_BASE_URL=https://ollama.mon-domaine.ma` et `LLM_API_KEY=<OLLAMA_PROXY_KEY>`.

## 4. Ollama sur un PC ou le réseau local, bot sur Supabase

Il faut un tunnel sortant : rien à ouvrir sur la box.

**Cloudflare Tunnel + Access** (recommandé) :

1. Créez un tunnel nommé vers `http://localhost:11434`, avec l'en-tête Host `localhost:11434`
   (`cloudflared tunnel …`, ou depuis le tableau de bord Zero Trust).
2. Protégez le nom d'hôte avec une application **Access** et un **service token**.
3. Côté bot :
   `LLM_HEADERS={"CF-Access-Client-Id":"<id>","CF-Access-Client-Secret":"<secret>"}`

Pour tester rapidement, `cloudflared tunnel --url http://localhost:11434 --http-host-header localhost:11434`
fonctionne, mais l'URL `trycloudflare.com` est **publique et sans contrôle d'accès** : à réserver à un test court.

Une machine du réseau local qui sert Ollama aux autres doit écouter sur toutes les interfaces :
`OLLAMA_HOST=0.0.0.0:11434` (variable d'environnement du service Ollama). Réglez aussi le pare-feu.

## 5. Tout en local (développement)

```bash
npx supabase start                                    # Docker
npx supabase functions serve telegram-webhook --env-file supabase/functions/.env
# .env : LLM_BASE_URL=http://host.docker.internal:11434   (Ollama du PC hôte)
#        ou http://192.168.1.20:11434                      (autre machine du réseau)
```

Évaluez un modèle avant de l'utiliser en production (mêmes variables `LLM_*`) :

```bash
npx deno run --allow-net --allow-env --allow-read --env-file=supabase/functions/.env eval/run.ts
```

## 6. Quels modèles ?

| Modèle (`ollama pull …`) | Mémoire (Q4) | Images | Remarques |
|---|---|---|---|
| `qwen2.5:14b` | ~9 Go | non | bon en JSON et en arabe ; bon choix pour `LLM_MODEL` |
| `qwen2.5:7b` | ~5 Go | non | sur CPU ou petit GPU, pour `LLM_FAST_MODEL` |
| `gemma3:12b` | ~8 Go | oui | multilingue ; bon pour `LLM_VISION_MODEL` (CNIE, courriers) |
| `gemma3:4b` | ~3 Go | oui | léger |
| `qwen2.5vl:7b` | ~6 Go | oui | lecture de documents |
| `qwen3:8b` / `qwen3:14b` | 5–9 Go | non | à utiliser avec `OLLAMA_THINK=false` |

Pour le darija, testez avec `eval/run.ts` sur vos propres cas : la qualité varie beaucoup d'un modèle à l'autre.

**La voix** : Ollama ne transcrit pas l'audio. Pour une transcription locale, utilisez un serveur Whisper
compatible OpenAI ([Speaches](https://github.com/speaches-ai/speaches), faster-whisper-server…) avec
`STT_BASE_URL` et `STT_MODEL`. Sans cela, les messages vocaux ne sont pas compris.

## 7. Suivi dans le tableau de bord

*Admin → « مراقبة الوكلاء الأذكياء »* ([`katiboumoumi.online/#/admin/agents`](https://katiboumoumi.online/#/admin/agents)) :

- **Modèles** : les modèles Ollama apparaissent sous le fournisseur `ollama`, avec un coût « local ». Le bouton
  « فحص مباشر » (vérification en direct) indique si le modèle est **téléchargé**, s'il est **en mémoire** (sinon la
  première réponse est plus lente) et le temps de réponse du serveur.
- **Configuration** : la table « خوادم Ollama » (serveurs Ollama) donne pour chaque serveur la version, les modèles en mémoire
  (taille et part en GPU) et les capacités détectées.
- **État** : un modèle absent du serveur est signalé avec la commande à lancer (`ollama pull <modèle>`).

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `HTTP 404 … not found, try pulling it first` | `ollama pull <modèle>` sur le serveur, ou nom mal écrit (`qwen2.5:14b`, pas `qwen2.5-14b`) |
| « الخدمة مشغولة » (service occupé) répété, erreurs `network` | serveur arrêté ou injoignable depuis Supabase (§2), tunnel coupé |
| `HTTP 401/403` | clé du proxy (`LLM_API_KEY`) ou jetons Access (`LLM_HEADERS`) incorrects |
| Premières réponses très lentes, puis rapides | chargement à froid : augmentez `OLLAMA_KEEP_ALIVE` (ex. `-1`) |
| Délai dépassé (`timeout`) | modèle trop gros pour la machine (CPU) : modèle plus petit, ou `LLM_TIMEOUT_MS` plus grand |
| JSON vide ou coupé | `OLLAMA_NUM_CTX` trop petit pour le document, ou un modèle qui « pense » : `OLLAMA_THINK=false` |
| Les photos ne sont pas lues | modèle sans vision : `LLM_VISION_MODEL=gemma3:12b` (capacités visibles dans le tableau de bord) |
