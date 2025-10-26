# Testing Guide: Citation Display Fix

## Overview
This document provides instructions for testing the citation display fix implemented in PR #[number].

## Bug Description
Citations from Promptflow were not being displayed in the chat interface despite being present in the HTTP response. The root cause was that component-level state variables were not being reset between API requests, causing stale citation data to interfere with new requests.

## Environment Setup Required

### Backend Configuration (.env)
Ensure these settings are configured:
```bash
# Enable Promptflow
USE_PROMPTFLOW=True
PROMPTFLOW_ENDPOINT=<your-promptflow-endpoint-url>
PROMPTFLOW_API_KEY=<your-api-key>
PROMPTFLOW_RESPONSE_TIMEOUT=120

# Promptflow field mappings
PROMPTFLOW_REQUEST_FIELD_NAME=query
PROMPTFLOW_RESPONSE_FIELD_NAME=reply
PROMPTFLOW_CITATIONS_FIELD_NAME=documents

# IMPORTANT: Streaming must be disabled or will be auto-disabled when using Promptflow
AZURE_OPENAI_STREAM=True  # Will be ignored when USE_PROMPTFLOW=True
```

### Promptflow Endpoint Requirements
Your Promptflow endpoint must return responses in this format:
```json
{
  "id": "unique-message-id",
  "reply": "The answer text",
  "documents": [
    {
      "title": "Document Title",
      "content": "Document content or excerpt",
      "filepath": "path/to/document.pdf",
      "url": "https://example.com/document.pdf",
      "chunk_id": "optional-chunk-identifier"
    }
  ]
}
```

## Test Scenarios

### Test 1: Single Query with Citations
**Steps:**
1. Deploy the application with Promptflow configured
2. Open the chat interface
3. Ask a question that should return citations (e.g., from your test dataset)
4. Verify the response appears
5. Check that citation numbers appear in the response text (e.g., [1], [2])
6. Click on a citation number
7. Verify that the citation panel opens on the right side
8. Verify the citation details are displayed correctly

**Expected Results:**
- Citations appear as clickable numbers in the text
- Citation panel displays the correct document information
- All citation fields (title, content, filepath, url) are populated

### Test 2: Multiple Sequential Queries
**Steps:**
1. Ask a first question that returns citations
2. Verify citations display correctly
3. Ask a second question that returns DIFFERENT citations
4. Verify the new citations display correctly
5. Verify the old citations are NOT displayed with the new response
6. Ask a third question that returns NO citations
7. Verify no citations are displayed
8. Ask a fourth question that returns citations again
9. Verify citations display correctly

**Expected Results:**
- Each response shows only its own citations
- No citation data leaks between requests
- Citation panel updates correctly for each response

### Test 3: Citation Panel Interaction
**Steps:**
1. Ask a question that returns multiple citations
2. Click on the first citation number
3. Verify the citation panel opens with the first citation
4. Click on a second citation number
5. Verify the panel updates to show the second citation
6. Click on the citation title (if URL is not a blob)
7. Verify it opens the source document in a new tab
8. Close the citation panel
9. Verify it closes correctly

**Expected Results:**
- Citation panel responds to all interactions
- Source links work correctly
- Panel state is managed properly

### Test 4: Chat History with Citations
**Steps:**
1. Enable CosmosDB chat history
2. Start a new conversation
3. Ask a question with citations
4. Verify citations display
5. Reload the page
6. Load the previous conversation
7. Verify citations still display correctly in the loaded conversation

**Expected Results:**
- Citations persist in chat history
- Reloaded citations display correctly

## Debugging

### Check Network Requests
1. Open browser Developer Tools (F12)
2. Go to Network tab
3. Filter by "conversation" or "history/generate"
4. Send a query
5. Check the response body for the tool message:
```json
{
  "choices": [{
    "messages": [
      {
        "role": "assistant",
        "content": "The answer text"
      },
      {
        "role": "tool",
        "content": "{\"citations\": [...]}"
      }
    ]
  }]
}
```

### Check Console Logs
Enable debug logging:
```bash
DEBUG=True
```

Look for these log entries:
- Backend: "chatCompletion: {..." showing the Promptflow response
- Frontend console: No errors related to citation parsing

### Verify Configuration
Check the `/frontend_settings` endpoint:
```bash
curl http://localhost:50505/frontend_settings
```

Should show:
```json
{
  "oyd_enabled": "<datasource-type-or-null>"
}
```

## Common Issues

### Citations Not Appearing
**Possible Causes:**
1. Promptflow endpoint not returning `documents` field
2. `PROMPTFLOW_CITATIONS_FIELD_NAME` doesn't match the field name in Promptflow response
3. Response is being streamed (check that USE_PROMPTFLOW=True)

### Old Citations Appearing
This was the bug that is now fixed. If you still see this:
1. Verify you're running the updated code (check commit hash)
2. Clear browser cache and reload
3. Check that the build includes the fix

### Citation Panel Not Opening
**Possible Causes:**
1. Citation format is incorrect
2. JavaScript errors in console
3. Frontend state management issues

## Success Criteria
- ✅ Citations appear on first query
- ✅ Citations change correctly between queries
- ✅ No citation data leaks between requests
- ✅ Citation panel opens and updates correctly
- ✅ Source links work when available
- ✅ Chat history preserves citations correctly
