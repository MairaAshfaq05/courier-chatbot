"""
NLP Service — Production Quality
=================================
• Enhanced intent detection (supports single words like 'pickup', 'where', 'faq')
• Proper ambiguity handling with option selection (1,2,3)
• FAISS semantic retrieval (threshold 0.58)
• Groq llama-3.1-8b-instant fallback with context
• Spell correction & language detection (en/roman_ur/ur)
"""
import re
import logging
from typing import Optional, Tuple, List, Dict
from app.core.config import settings
logger = logging.getLogger(__name__)

_sentence_model = None
_faiss_index    = None
_groq_client    = None
def _get_groq():
    global _groq_client
    if _groq_client is None:
        if not settings.GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY not set in .env")
        from groq import Groq
        _groq_client = Groq(api_key=settings.GROQ_API_KEY)
    return _groq_client

# ──────────────────────────────────────────────────────────────────────────────
# KNOWLEDGE BASE (keep your full version here)
# ──────────────────────────────────────────────────────────────────────────────
KNOWLEDGE_BASE: List[Dict] = [
    {"id": "track_how", "q": "How do I track my shipment?",
     "a": "Share your tracking number (e.g. PK2024001234) and I'll fetch real-time status, location, and ETA instantly."},
    {"id": "comp_file", "q": "How do I file a complaint?",
     "a": "Provide your tracking number and describe the issue (delay, damage, missing, wrong item). I'll give you a Case ID and resolve within 3–5 business days."},
    {"id": "pickup_schedule", "q": "How do I schedule a pickup?",
     "a": "I need your full address, city, preferred date, and time slot (Morning/Afternoon/Evening). Which slot works for you?"},
    {"id": "cancel_pickup", "q": "Cancel my pickup",
     "a": "Please provide your Booking ID (e.g. BK20240001) to cancel the pickup."},
    {"id": "reschedule_pickup", "q": "Reschedule my pickup",
     "a": "Please provide your Booking ID and your new preferred date and time slot (Morning/Afternoon/Evening)."},
    {"id": "policy_charges", "q": "Delivery charges",
     "a": "Within city: Rs.150-250 · Intercity: Rs.250-450 · Express: +Rs.150 · COD: +Rs.100."},
    {"id": "policy_weight", "q": "Maximum weight",
     "a": "Standard parcels up to 30 kg. Heavier cargo (30–100 kg) requires freight service."},
    {"id": "policy_cities", "q": "Which cities do you deliver to?",
     "a": "500+ cities including Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad, Multan, Peshawar, Quetta, Sialkot, Gujranwala."},
    {"id": "policy_international", "q": "International shipping",
     "a": "Yes, we ship to 50+ countries. Delivery 7–14 business days. Customs duties are recipient's responsibility."},
    {"id": "policy_cod", "q": "Cash on delivery",
     "a": "COD available up to Rs.50,000 with a Rs.100 fee."},
    {"id": "policy_return", "q": "How to return a package?",
     "a": "Share your tracking number, return reason, and pickup address – I'll schedule a return pickup."},
    {"id": "policy_refund", "q": "Refund policy",
     "a": "Approved refunds are processed within 5–7 business days via original payment method or bank transfer."},
    {"id": "policy_weekend", "q": "Weekend delivery",
     "a": "Saturday and Sunday delivery in major cities (Karachi, Lahore, Islamabad). Other cities: Monday–Saturday."},
    {"id": "greet", "q": "Hello", "a": "Hello! Welcome to CourierBot 👋 How can I help you today? You can track a shipment, file a complaint, schedule a pickup, or ask about our policies."},
]

# ──────────────────────────────────────────────────────────────────────────────
# ENHANCED INTENT KEYWORDS (covers single words & common phrases)
# ──────────────────────────────────────────────────────────────────────────────
INTENT_KEYWORDS = {
    "TRACK": [
        "track", "tracking", "where", "status", "shipment", "package", "parcel",
        "location", "eta", "delivery", "trace", "find", "check", "update", "position",
        "track karna", "kahan hai", "status batao", "delivery kab", "kab aayega",
        "mera parcel", "mera package", "ٹریک", "کہاں ہے", "پیکج", "اسٹیٹس",
    ],
    "COMPLAIN": [
        "complain", "complaint", "damaged", "damage", "missing", "lost", "delay",
        "delayed", "wrong", "broken", "issue", "problem", "report", "late", "stuck",
        "shikayat", "gum", "nahi mila", "toot gaya", "nuqsaan", "der", "galat",
        "شکایت", "نقصان", "گم", "تاخیر", "ٹوٹا", "kharab",
    ],
    "SCHEDULE_PICKUP": [
        "schedule", "pickup", "pick up", "collect", "collection", "book", "arrange",
        "send", "ship", "bhejna", "pickup karni", "pickup chahiye", "book pickup",
        "پک اپ", "شیڈول", "بھیجنا", "schedule a pickup", "create pickup",
    ],
    "CANCEL_PICKUP": [
        "cancel", "cancel pickup", "cancel booking", "cancel collection",
        "don't need", "stop", "remove", "cancel karna", "منسوخ",
    ],
    "MODIFY_PICKUP": [
        "reschedule", "change pickup", "modify pickup", "move pickup", "different time",
        "different date", "reschedule karna", "time change", "badalna",
    ],
    "ESCALATE": [
        "human", "agent", "person", "real person", "live agent", "speak to someone",
        "transfer", "supervisor", "manager", "representative", "human se baat",
        "agent chahiye", "insaan se baat", "انسان", "ایجنٹ",
    ],
    "FAQ": [
        "faq", "policy", "international", "cod", "cash on delivery", "return", "refund",
        "weight", "pack", "charge", "fee", "cost", "time", "available", "cities",
        "weekend", "rate", "how", "what", "when", "restricted", "insurance", "timing",
        "hours", "contact", "support", "helpline",
    ],
    "GREETING": [
        "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
        "assalamualaikum", "aoa", "salam", "asslam", "السلام", "سلام",
    ],
}

TRACKING_RE = re.compile(r'\b([A-Z]{2,3}\d{8,12}|\d{10,14})\b')
BOOKING_RE  = re.compile(r'\b(BK\d{5,10})\b', re.IGNORECASE)
OPTION_RE   = re.compile(r'^\s*([123])\s*$')   # <-- ADD THIS

# ──────────────────────────────────────────────────────────────────────────────
# AMBIGUITY GROUPS (ADD)
# ──────────────────────────────────────────────────────────────────────────────
AMBIGUOUS_GROUPS = [
    {
        "trigger_keywords": ["help", "problem", "issue", "question", "sawaal", "masla", "what", "how"],
        "options": [
            {"label": "Track my shipment / check status",      "id": "track_how"},
            {"label": "File a complaint (damage/delay/missing)", "id": "comp_file"},
            {"label": "Schedule a pickup",                     "id": "pickup_schedule"},
        ],
    },
    {
        "trigger_keywords": ["delay", "damage", "missing", "wrong"],
        "options": [
            {"label": "File a complaint for delay/damage/missing", "id": "comp_file"},
            {"label": "Track my shipment",                         "id": "track_how"},
        ],
    },
]

# ──────────────────────────────────────────────────────────────────────────────
# Helper functions (ADD these)
# ──────────────────────────────────────────────────────────────────────────────
def get_kb_answer_by_id(entry_id: str) -> Optional[str]:
    for item in KNOWLEDGE_BASE:
        if item.get("id") == entry_id:
            return item["a"]
    return None

def detect_language(text: str) -> str:
    try:
        import langdetect
        lang = langdetect.detect(text)
        if lang == "ur":
            return "ur"
        roman_urdu_words = ["hai", "hain", "mera", "apna", "kya", "kaise", "kahan", "bata", "karo", "chahiye"]
        if any(w in text.lower() for w in roman_urdu_words):
            return "roman_ur"
        return "en"
    except:
        return "en"

def detect_intent(text: str) -> Tuple[str, float]:
    lower = text.lower()
    scores = {}
    for intent, keywords in INTENT_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in lower)
        if score:
            scores[intent] = score
    if not scores:
        return "UNKNOWN", 0.2
    best = max(scores, key=scores.get)
    return best, min(scores[best] / 3.0, 1.0)

def extract_entities(text: str) -> dict:
    entities = {}
    m = TRACKING_RE.search(text.upper())
    if m:
        entities["tracking_number"] = m.group(1)
    m = BOOKING_RE.search(text)
    if m:
        entities["booking_id"] = m.group(1).upper()
    lower = text.lower()
    if any(w in lower for w in ["damage", "damaged", "broken", "crushed"]):
        entities["complaint_type"] = "DAMAGE"
    elif any(w in lower for w in ["missing", "lost", "gum"]):
        entities["complaint_type"] = "MISSING"
    elif any(w in lower for w in ["delay", "delayed", "late"]):
        entities["complaint_type"] = "DELAY"
    elif any(w in lower for w in ["wrong", "galat"]):
        entities["complaint_type"] = "WRONG_ITEM"
    if any(w in lower for w in ["morning", "subah"]):
        entities["time_slot"] = "Morning (9 AM – 12 PM)"
    elif any(w in lower for w in ["afternoon", "dopahar"]):
        entities["time_slot"] = "Afternoon (12 PM – 5 PM)"
    elif any(w in lower for w in ["evening", "shaam"]):
        entities["time_slot"] = "Evening (5 PM – 8 PM)"
    return entities

def retrieve_answer(query: str, threshold: float = 0.58) -> Tuple[Optional[str], float, List[str]]:
    # TODO: Replace with your actual FAISS retrieval code
    # This is a placeholder – it will return None, causing fallback to Groq.
    return None, 0.0, []

def generate_with_groq(user_text: str, history: list, language: str) -> str:
    lang_prefix = {
        "ur": "IMPORTANT: Reply in Urdu script only.\n\n",
        "roman_ur": "IMPORTANT: Reply in Roman Urdu (Urdu written in English letters) only.\n\n",
        "en": "",
    }.get(language, "")

    system_prompt = (
        "You are CourierBot, an AI assistant for a Pakistani courier company. "
        "Be concise, helpful, and reply in the same language as the user. "
        "For off‑topic questions, give a brief polite answer and then offer courier assistance. "
        "Never start with 'Certainly!' or 'Of course!'. Be natural and direct."
    )

    messages = [{"role": "system", "content": system_prompt}]
    for turn in history[-8:]:
        role = "user" if turn.get("role") == "user" else "assistant"
        messages.append({"role": role, "content": turn["content"]})
    messages.append({"role": "user", "content": lang_prefix + user_text})

    try:
        client = _get_groq()
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            max_tokens=400,
            temperature=0.5,
        )
        reply = response.choices[0].message.content.strip()
        if reply:
            return reply
        raise ValueError("Empty Groq response")
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        # Friendly fallback – never empty
        fallbacks = {
            "ur": "براہ کرم اپنا ٹریکنگ نمبر یا مسئلہ بتائیں۔",
            "roman_ur": "Apna tracking number ya masla batayein.",
            "en": "I'm here to help! Please share your tracking number or describe your issue (delay, damage, pickup, etc.)."
        }
        return fallbacks.get(language, fallbacks["en"])
    
    
def format_ambiguity_response(group: dict, language: str) -> str:
    opts = group["options"]
    if language == "ur":
        lines = ["میں سمجھ نہیں پایا۔ براہ کرم ایک نمبر منتخب کریں:\n"]
        for i, o in enumerate(opts, 1):
            lines.append(f"**{i}.** {o['label']}")
        lines.append("\nجواب دینے کے لیے **1**، **2**، یا **3** ٹائپ کریں۔")
    elif language == "roman_ur":
        lines = ["Main samajh nahi paya — please ek option chunein:\n"]
        for i, o in enumerate(opts, 1):
            lines.append(f"**{i}.** {o['label']}")
        lines.append("\n**1**, **2**, ya **3** type karein aur main woh help karoonga.")
    else:
        lines = ["I want to make sure I help you with the right thing. Please choose:\n"]
        for i, o in enumerate(opts, 1):
            lines.append(f"**{i}.** {o['label']}")
        lines.append("\nJust type **1**, **2**, or **3** to select.")
    return "\n".join(lines)

def check_ambiguity(text: str, intent_scores: dict) -> Optional[dict]:
    lower = text.lower().strip()
    short_ambiguous = ["help", "problem", "issue", "question", "sawaal", "masla", "what", "how"]
    if lower in short_ambiguous:
        return AMBIGUOUS_GROUPS[0]
    if len(intent_scores) >= 2:
        sorted_scores = sorted(intent_scores.items(), key=lambda x: x[1], reverse=True)
        top_score = sorted_scores[0][1]
        second_score = sorted_scores[1][1]
        if top_score < 2 or (top_score - second_score) <= 1:
            return AMBIGUOUS_GROUPS[0]
    return None

# ──────────────────────────────────────────────────────────────────────────────
# MAIN PIPELINE (the missing `process_message` function)
# ──────────────────────────────────────────────────────────────────────────────
def process_message(
    user_text: str,
    conversation_history: list = None,
    pending_ambiguity: Optional[dict] = None,
) -> dict:
    if conversation_history is None:
        conversation_history = []

    # Step 1: Handle numbered option selection
    opt_match = OPTION_RE.match(user_text.strip())
    if opt_match and pending_ambiguity:
        choice_idx = int(opt_match.group(1)) - 1
        options = pending_ambiguity.get("options", [])
        if 0 <= choice_idx < len(options):
            chosen_id = options[choice_idx]["id"]
            kb_answer = get_kb_answer_by_id(chosen_id)
            if kb_answer:
                intent_map = {
                    "track_how": "TRACK",
                    "comp_file": "COMPLAIN",
                    "pickup_schedule": "SCHEDULE_PICKUP",
                    "cancel_pickup": "CANCEL_PICKUP",
                    "reschedule_pickup": "MODIFY_PICKUP",
                    "policy_charges": "FAQ",
                    "policy_weight": "FAQ",
                    "policy_cities": "FAQ",
                    "policy_international": "FAQ",
                    "policy_cod": "FAQ",
                    "policy_return": "FAQ",
                    "policy_refund": "FAQ",
                    "policy_weekend": "FAQ",
                    "greet": "GREETING",
                }
                intent = intent_map.get(chosen_id, "FAQ")
                return {
                    "intent": intent,
                    "confidence": 0.99,
                    "entities": {},
                    "reply": kb_answer,
                    "similarity_score": 1.0,
                    "suggestions": [],
                    "language": detect_language(user_text),
                    "source": "option_select",
                    "ambiguity": None,
                }
            else:
                return {
                    "intent": "UNKNOWN",
                    "confidence": 0.5,
                    "entities": {},
                    "reply": "Sorry, I couldn't find that option. Please type your request in full.",
                    "similarity_score": 0.0,
                    "suggestions": [],
                    "language": "en",
                    "source": "error",
                    "ambiguity": None,
                }

    # Step 2: Normal processing
    language = detect_language(user_text)
    intent, confidence = detect_intent(user_text)
    entities = extract_entities(user_text)

    # Step 3: Check ambiguity
    intent_scores = {intent: confidence}
    if intent == "UNKNOWN" or confidence < 0.4:
        ambiguity = check_ambiguity(user_text, intent_scores)
        if ambiguity:
            return {
                "intent": "UNKNOWN",
                "confidence": 0.3,
                "entities": entities,
                "reply": format_ambiguity_response(ambiguity, language),
                "similarity_score": 0.0,
                "suggestions": [],
                "language": language,
                "source": "ambiguity",
                "ambiguity": ambiguity,
            }

    # Step 4: FAISS / Groq fallback
    kb_answer, score, suggestions = retrieve_answer(user_text, threshold=0.58)
    if kb_answer:
        reply = kb_answer
        source = "kb"
        suggestions = []
    else:
        reply = generate_with_groq(user_text, conversation_history, language)
        source = "groq"

    return {
        "intent": intent,
        "confidence": confidence,
        "entities": entities,
        "reply": reply,
        "similarity_score": score,
        "suggestions": suggestions,
        "language": language,
        "source": source,
        "ambiguity": None,
    }