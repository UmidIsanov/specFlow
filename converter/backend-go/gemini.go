package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// --- Тела запроса/ответа Gemini REST API ---

type gPart struct {
	Text       string       `json:"text,omitempty"`
	InlineData *gInlineData `json:"inline_data,omitempty"`
}

type gInlineData struct {
	MimeType string `json:"mime_type"`
	Data     string `json:"data"`
}

type gContent struct {
	Parts []gPart `json:"parts"`
}

type gThinking struct {
	ThinkingBudget int `json:"thinkingBudget"`
}

type gGenConfig struct {
	ResponseMimeType string          `json:"responseMimeType"`
	ResponseSchema   json.RawMessage `json:"responseSchema"`
	Temperature      float64         `json:"temperature"`
	// без явного лимита длинная таблица обрезается на полуслове — JSON не парсится
	MaxOutputTokens int `json:"maxOutputTokens"`
	// «размышления» — больше половины оплачиваемых токенов; для переписывания таблицы они не нужны
	ThinkingConfig *gThinking `json:"thinkingConfig,omitempty"`
}

type gRequest struct {
	Contents          []gContent `json:"contents"`
	SystemInstruction *gContent  `json:"system_instruction,omitempty"`
	GenerationConfig  gGenConfig `json:"generationConfig"`
}

type gResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error"`
	UsageMetadata *struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
		ThoughtsTokenCount   int `json:"thoughtsTokenCount"`
		TotalTokenCount      int `json:"totalTokenCount"`
	} `json:"usageMetadata"`
}

// Две минуты на попытку: нормальный ответ приходит за 20–60 с, дольше — значит, сервис буксует.
var httpClient = &http.Client{Timeout: 2 * time.Minute}

// thinkingConfigFor: явный бюджет из запроса (-2 — не задан, берём из окружения).
func thinkingConfigFor(mode string, explicit int) *gThinking {
	if explicit == -2 {
		return thinkingConfig(mode)
	}
	if explicit < 0 {
		return nil
	}
	return &gThinking{ThinkingBudget: explicit}
}

// thinkingConfig ограничивает бюджет размышлений: GEMINI_THINKING_BUDGET (spec) и
// GEMINI_THINKING_BUDGET_KP. Для КП по умолчанию 0: те же строки, а выходных токенов
// в шесть раз меньше, чем с раздумьями. Для чертежей 2048. -1 — без ограничения.
func thinkingConfig(mode string) *gThinking {
	key := "GEMINI_THINKING_BUDGET"
	budget := 2048
	if mode == "kp" {
		key = "GEMINI_THINKING_BUDGET_KP"
		budget = 0
	}
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			budget = n
		}
	}
	if budget < 0 {
		return nil
	}
	return &gThinking{ThinkingBudget: budget}
}

// parseSpecFromPDF отправляет PDF напрямую в Gemini и возвращает разобранную таблицу.
// mode: "" / "spec" — спецификация ГОСТ, "kp" — коммерческое предложение поставщика.
// Повторяет запрос при временных ошибках (429/503) с нарастающей задержкой.
func parseSpecFromPDF(pdf []byte, mode string, thinking int) (*SpecResult, error) {
	apiKey := getAPIKey()
	if apiKey == "" {
		return nil, fmt.Errorf("не найден GEMINI_API_KEY")
	}
	prompt, schema := promptAndSchema(mode)
	userText := "Извлеки спецификацию оборудования, изделий и материалов из этого чертежа."
	if mode == "kp" {
		userText = "Извлеки все строки таблицы из этого коммерческого предложения."
	}

	reqBody := gRequest{
		Contents: []gContent{{
			Parts: []gPart{
				{InlineData: &gInlineData{MimeType: "application/pdf", Data: base64.StdEncoding.EncodeToString(pdf)}},
				{Text: userText},
			},
		}},
		SystemInstruction: &gContent{Parts: []gPart{{Text: prompt}}},
		GenerationConfig: gGenConfig{
			ResponseMimeType: "application/json",
			ResponseSchema:   json.RawMessage(schema),
			Temperature:      0,
			MaxOutputTokens:  65536,
			ThinkingConfig:   thinkingConfigFor(mode, thinking),
		},
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		geminiModel(mode), apiKey)

	maxRetries := 3
	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		started := time.Now()
		log.Printf("gemini %s: запрос %d/%d, %d КБ", geminiModel(mode), attempt, maxRetries, len(payload)/1024)
		resp, err := httpClient.Post(url, "application/json", bytes.NewReader(payload))
		if err != nil {
			lastErr = err
			log.Printf("gemini %s: сбой соединения через %s: %v", geminiModel(mode), time.Since(started).Round(time.Second), err)
			time.Sleep(time.Duration(2<<attempt) * time.Second)
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == 429 || resp.StatusCode == 503 {
			lastErr = fmt.Errorf("gemini %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
			log.Printf("gemini %s: %d через %s, повтор", geminiModel(mode), resp.StatusCode, time.Since(started).Round(time.Second))
			time.Sleep(time.Duration(2<<attempt) * time.Second)
			continue
		}
		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("gemini %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		}

		var gr gResponse
		if err := json.Unmarshal(body, &gr); err != nil {
			return nil, fmt.Errorf("разбор ответа gemini: %w", err)
		}
		if gr.Error != nil {
			return nil, fmt.Errorf("gemini: %s", gr.Error.Message)
		}
		if len(gr.Candidates) == 0 || len(gr.Candidates[0].Content.Parts) == 0 {
			return nil, fmt.Errorf("gemini вернул пустой ответ")
		}

		var spec SpecResult
		if err := json.Unmarshal([]byte(gr.Candidates[0].Content.Parts[0].Text), &spec); err != nil {
			return nil, fmt.Errorf("разбор JSON спецификации: %w", err)
		}
		// сколько стоил запрос — в результат и в лог, чтобы цена документа была известна
		if u := gr.UsageMetadata; u != nil {
			spec.Usage = &Usage{
				Model:  geminiModel(mode),
				Input:  u.PromptTokenCount,
				Output: u.CandidatesTokenCount + u.ThoughtsTokenCount,
				Total:  u.TotalTokenCount,
			}
			log.Printf("gemini %s: вход %d, выход %d (в т.ч. размышления %d), строк %d",
				geminiModel(mode), u.PromptTokenCount, u.CandidatesTokenCount+u.ThoughtsTokenCount, u.ThoughtsTokenCount, len(spec.Items))
		}
		return &spec, nil
	}
	return nil, fmt.Errorf("gemini недоступен после %d попыток: %v", maxRetries, lastErr)
}
