import { GoogleGenAI, Type } from "@google/genai";
import { Manga, AIRecommendation, CharacterInfo } from "../types";

// --- Исправление: используем Vite-подход для переменных окружения ---
const apiKey = import.meta.env.VITE_API_KEY;

let ai: GoogleGenAI | null = null;
if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
} else {
    console.warn("Переменная окружения VITE_API_KEY не установлена. Функции Gemini будут отключены.");
}

// --- Circuit Breaker (ограничение запросов при ошибках) ---
let isThrottledState = false;
let throttleEndTime = 0;
const THROTTLE_DURATION = 5 * 60 * 1000; // 5 минут

const updateThrottleState = () => {
    if (isThrottledState && Date.now() >= throttleEndTime) {
        console.log("Период ограничения Gemini API завершен. Возобновление запросов.");
        isThrottledState = false;
    }
};

export const isGeminiThrottled = (): boolean => {
    updateThrottleState();
    return isThrottledState;
};

const handleApiError = (error: any) => {
    console.error("Ошибка Gemini API:", error);

    let errorString = '';
    try {
        errorString = error instanceof Error ? error.toString() : JSON.stringify(error);
    } catch {
        errorString = String(error);
    }

    if (errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED')) {
        console.warn("Gemini API rate limit exceeded. Throttling requests for 5 минут.");
        isThrottledState = true;
        throttleEndTime = Date.now() + THROTTLE_DURATION;
    }
};

const checkThrottle = (): boolean => {
    updateThrottleState();
    if (isThrottledState) {
        console.warn("Запрос к Gemini API пропущен из-за превышения лимитов.");
    }
    return isThrottledState;
};

// --- Генерация краткого содержания манги ---
export const generateMangaSummary = async (title: string, description: string): Promise<string> => {
    if (!ai || checkThrottle()) {
        return "Функции ИИ недоступны. Настройте API ключ или попробуйте позже.";
    }

    const prompt = `
        Вы — полезный ассистент для сайта по чтению манги.
        Создайте краткое (2–3 предложения), без спойлеров, содержание манги:
        Название: ${title}
        Описание: ${description}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        if (response && typeof response.text === 'string') {
            return response.text;
        }

        console.error("Gemini API: Неожиданный формат ответа для саммари", response);
        return "К сожалению, не удалось сгенерировать краткое содержание.";
    } catch (error) {
        handleApiError(error);
        return "К сожалению, не удалось сгенерировать краткое содержание.";
    }
};

// --- Рекомендации на основе одной манги ---
export const generateAIRecommendations = async (manga: Manga): Promise<string[]> => {
    if (!ai || checkThrottle()) return [];

    const prompt = `
        Основываясь на манге:
        Название: ${manga.title}
        Описание: ${manga.description}
        Жанры: ${manga.genres.join(', ')}
        Предложите 5 других названий манги (на русском языке), похожих по темам и стилю.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        recommendations: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                }
            }
        });

        if (!response || typeof response.text !== 'string' || response.text.trim() === '') {
            console.error("Gemini API: Пустой ответ для рекомендаций", response);
            return [];
        }

        try {
            return JSON.parse(response.text.trim()).recommendations || [];
        } catch (parseError) {
            console.error("Ошибка парсинга JSON рекомендаций", parseError, response.text);
            return [];
        }

    } catch (error) {
        handleApiError(error);
        return [];
    }
};

// --- Персонализированные рекомендации ---
export const generatePersonalizedRecommendations = async (mangaList: Manga[]): Promise<AIRecommendation[]> => {
    if (!ai || checkThrottle() || mangaList.length === 0) return [];

    const titles = mangaList.map(m => m.title).join(', ');
    const prompt = `
        Пользователь интересуется мангой: ${titles}.
        Предложите 5 других названий с коротким пояснением, почему они подойдут.
        Ответ — на русском языке.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        recommendations: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    reason: { type: Type.STRING }
                                },
                                required: ["title", "reason"],
                            }
                        }
                    },
                    required: ["recommendations"],
                }
            }
        });

        if (!response || typeof response.text !== 'string' || response.text.trim() === '') {
            console.error("Gemini API: Пустой ответ для персонализированных рекомендаций", response);
            return [];
        }

        try {
            return JSON.parse(response.text.trim()).recommendations || [];
        } catch (parseError) {
            console.error("Ошибка парсинга JSON персонализированных рекомендаций", parseError, response.text);
            return [];
        }

    } catch (error) {
        handleApiError(error);
        return [];
    }
};

// --- Информация о персонажах ---
export const generateCharacterInfo = async (manga: Manga): Promise<CharacterInfo[]> => {
    if (!ai || checkThrottle()) return [];

    const prompt = `
        Определите 2–3 главных персонажей манги "${manga.title}".
        Для каждого — короткое описание (без спойлеров, одно предложение).
        Ответ на русском.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        characters: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    description: { type: Type.STRING }
                                },
                                required: ["name", "description"],
                            }
                        }
                    },
                    required: ["characters"],
                }
            }
        });

        if (!response || typeof response.text !== 'string' || response.text.trim() === '') {
            console.error("Gemini API: Пустой ответ для информации о персонажах", response);
            return [];
        }

        try {
            return JSON.parse(response.text.trim()).characters || [];
        } catch (parseError) {
            console.error("Ошибка парсинга JSON персонажей", parseError, response.text);
            return [];
        }

    } catch (error) {
        handleApiError(error);
        return [];
    }
};

// --- Проверка доступности Gemini ---
export const isGeminiAvailable = (): boolean => {
    return !!ai;
};
