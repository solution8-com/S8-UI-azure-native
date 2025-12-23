# Quick Reference: Image Format Expectations by Backend

This is a condensed reference guide for developers working with different backend options. For complete details, see [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md).

## 🎯 Quick Answer: What Format Does the Frontend Expect?

### For User-Uploaded Images (Input)
The frontend sends images to the backend in this format:
```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "What's in this image?"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
      }
    }
  ]
}
```

### For Backend-Generated Charts (Output)
The backend should return charts in the `tool` message's `code_exec_result` field as a **plain base64 string WITHOUT the data URI prefix**:

```json
{
  "role": "tool",
  "content": "{
    \"all_exec_results\": [{
      \"code_exec_result\": \"iVBORw0KGgoAAAANSUhEUgAA...\"
    }]
  }"
}
```

The frontend will add `data:image/png;base64,` automatically.

---

## 📊 Backend Options Comparison

### Option 1: Prompt Flow

**When to use**: Custom orchestration flows, complex RAG patterns

**Configuration**:
```env
USE_PROMPTFLOW=True
PROMPTFLOW_ENDPOINT=https://your-endpoint.azure.com
PROMPTFLOW_API_KEY=your-key
```

**Input Format** (what Prompt Flow receives):
```json
{
  "query": "user question text",
  "chat_history": [
    {
      "inputs": {"query": "previous question"},
      "outputs": {"reply": "previous answer"}
    }
  ]
}
```

**Output Format** (what Prompt Flow must return):
```json
{
  "id": "msg-123",
  "reply": "The answer text with citations like [doc1]",
  "documents": [
    {
      "content": "...",
      "title": "Document Title",
      "filepath": "path/to/doc.pdf",
      "url": "https://..."
    }
  ]
}
```

**Chart Support**: ❌ Not directly supported. Would need custom field mapping.

**Key Points**:
- Field names are configurable via `PROMPTFLOW_REQUEST_FIELD_NAME` and `PROMPTFLOW_RESPONSE_FIELD_NAME`
- Citations come from the `PROMPTFLOW_CITATIONS_FIELD_NAME` field (default: "documents")
- Images in user messages are **converted** to text-only for Prompt Flow
- Backend formats this into standard frontend format with tool + assistant messages

---

### Option 2: Azure OpenAI with Azure AI Search

**When to use**: RAG with Azure AI Search, Azure CosmosDB, Elasticsearch, etc.

**Configuration**:
```env
DATASOURCE_TYPE=AzureCognitiveSearch  # or AzureCosmosDB, Elasticsearch, etc.
AZURE_SEARCH_SERVICE=your-service
AZURE_SEARCH_INDEX=your-index
AZURE_SEARCH_KEY=your-key
```

**Input Format**:
- Standard OpenAI API format with vision support
- Images pass through as content arrays

**Output Format** (from backend to frontend):
```json
{
  "id": "chatcmpl-123",
  "model": "gpt-4-vision",
  "created": 1234567890,
  "object": "chat.completion",
  "choices": [{
    "messages": [
      {
        "role": "tool",
        "content": "{\"citations\": [...], \"intent\": \"...\"}"
      },
      {
        "role": "assistant",
        "content": "Answer with citation markers [doc1], [doc2]"
      }
    ]
  }],
  "history_metadata": {...}
}
```

**Chart Support**: ❌ No built-in chart generation

**Key Points**:
- Citations automatically extracted from Azure AI Search
- Context/intent information in tool message
- Supports vision-enabled models for image understanding
- Streaming and non-streaming modes available

---

### Option 3: Azure OpenAI with Azure SQL Server

**When to use**: Text-to-SQL queries with visualization capabilities

**Configuration**:
```env
DATASOURCE_TYPE=AzureSqlServer
AZURE_SQL_SERVER_CONNECTION_STRING=your-connection
# OR
AZURE_SQL_SERVER_DATABASE_SERVER=server.database.windows.net
AZURE_SQL_SERVER_DATABASE_NAME=dbname
AZURE_SQL_SERVER_PORT=1433
```

**Input Format**: Same as Azure AI Search option

**Output Format**:
```json
{
  "choices": [{
    "messages": [
      {
        "role": "tool",
        "content": "{
          \"all_exec_results\": [
            {
              \"intent\": \"visualization\",
              \"search_query\": \"SELECT ...\",
              \"code_generated\": \"import matplotlib...\",
              \"code_exec_result\": \"iVBORw0KGgoAAAANSUhEUg...\"
            }
          ]
        }"
      },
      {
        "role": "assistant",
        "content": "Here's a chart showing the data..."
      }
    ]
  }]
}
```

**Chart Support**: ✅ **Yes!** Charts in `code_exec_result` field

**Key Points**:
- Executes Python/R code to generate visualizations
- Charts encoded as base64 PNG **without data URI prefix**
- Frontend extracts from last item in `all_exec_results` array
- Supports multiple execution steps

---

### Option 4: Standard OpenAI API (No Data Source)

**When to use**: Simple chat without RAG, or custom function calling

**Configuration**:
```env
DATASOURCE_TYPE=  # Leave empty
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=your-key
AZURE_OPENAI_MODEL=gpt-4-vision-preview
```

**Input/Output**: Standard OpenAI Chat Completion API format

**Chart Support**: ⚠️ Via function calling only

**Key Points**:
- No automatic citations or data grounding
- Vision models support image understanding
- Custom function calling can add chart generation
- Most flexible but requires custom implementation

---

## 🔍 Frontend Processing Details

### How Images Are Extracted

**For User Uploads** (in `QuestionInput.tsx`):
```typescript
1. User selects file
2. resizeImage(file, 800, 800) → "data:image/jpeg;base64,..."
3. Message content = [{type: "text", ...}, {type: "image_url", image_url: {url: base64}}]
```

**For Backend Charts** (in `Chat.tsx`):
```typescript
function parsePlotFromMessage(message: ChatMessage) {
  if (message?.role === "tool") {
    const execResults = JSON.parse(message.content);
    return execResults.all_exec_results.at(-1)?.code_exec_result;
  }
  return null;
}
```

### How Answer Component Uses Charts

```typescript
<Answer
  answer={{
    answer: assistantMessage.content,
    citations: parseCitationFromMessage(toolMessage),
    generated_chart: parsePlotFromMessage(toolMessage),  // ← Chart from tool message
    message_id: assistantMessage.id
  }}
/>
```

### Final Rendering

```tsx
{parsedAnswer?.generated_chart !== null && (
  <img src={`data:image/png;base64, ${parsedAnswer.generated_chart}`} />
)}
```

---

## ⚙️ Configuration Priority

The backend determines which integration to use in this order:

1. **USE_PROMPTFLOW=True** → Prompt Flow integration
2. **DATASOURCE_TYPE** set → Azure OpenAI with data source
3. **DATASOURCE_TYPE** empty → Standard OpenAI API

---

## 🚨 Common Issues

### Issue: Chart not displaying
**Check**:
- Tool message comes **before** assistant message
- Base64 string has **no** `data:image/png;base64,` prefix
- Field name is exactly `code_exec_result` in `all_exec_results[-1]`
- Base64 string is valid PNG encoding

### Issue: Citations not showing
**Check**:
- Tool message has `citations` array in JSON content
- Citations have required fields: `content`, `id`, `title`
- Answer text includes citation markers like `[doc1]`, `[doc2]`

### Issue: User images not working
**Check**:
- Content is array format: `[{type: "text", ...}, {type: "image_url", ...}]`
- Image URL includes full data URI: `data:image/jpeg;base64,...`
- Model supports vision (e.g., gpt-4-vision-preview)
- OYD mode is not enabled (disables image uploads)

---

## 📝 Example Backend Response Templates

### Prompt Flow Response Template

```python
def create_promptflow_response(reply_text, citations):
    return {
        "id": str(uuid.uuid4()),
        "reply": reply_text,  # Or your PROMPTFLOW_RESPONSE_FIELD_NAME
        "documents": citations  # Or your PROMPTFLOW_CITATIONS_FIELD_NAME
    }
```

### Azure SQL Server Response Template

```python
def create_sql_response_with_chart(answer_text, chart_base64):
    return {
        "choices": [{
            "messages": [
                {
                    "role": "tool",
                    "content": json.dumps({
                        "all_exec_results": [{
                            "intent": "visualization",
                            "code_exec_result": chart_base64  # NO data URI prefix!
                        }]
                    })
                },
                {
                    "role": "assistant",
                    "content": answer_text
                }
            ]
        }]
    }
```

### Azure AI Search Response Template

```python
def create_search_response(answer_text, citations):
    return {
        "choices": [{
            "messages": [
                {
                    "role": "tool",
                    "content": json.dumps({
                        "citations": citations,
                        "intent": "search"
                    })
                },
                {
                    "role": "assistant",
                    "content": answer_text
                }
            ]
        }]
    }
```

---

## 🔗 Related Files

- **Full Documentation**: [IMAGE_DISPLAY_DATA_FLOW.md](./IMAGE_DISPLAY_DATA_FLOW.md)
- **Backend Settings**: `backend/settings.py`
- **Response Formatting**: `backend/utils.py`
- **Frontend Types**: `frontend/src/api/models.ts`
- **Chat Logic**: `frontend/src/pages/chat/Chat.tsx`
- **Answer Display**: `frontend/src/components/Answer/Answer.tsx`

---

## 📞 Need Help?

For questions about:
- **Prompt Flow integration**: Check `convert_to_pf_format()` and `format_pf_non_streaming_response()` in `backend/utils.py`
- **Chart generation**: Review `parsePlotFromMessage()` in `frontend/src/pages/chat/Chat.tsx`
- **Citations**: See `parseCitationFromMessage()` and `AnswerParser.tsx`
- **Image uploads**: Check `QuestionInput.tsx` and `resizeImage.ts`
