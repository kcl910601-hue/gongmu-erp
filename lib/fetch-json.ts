export type FetchJsonResult<T> =
  | { data: T; error: null; response: Response }
  | { data: null; error: Error; response: Response | null };

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<FetchJsonResult<T>> {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("네트워크 요청에 실패했습니다."),
      response: null,
    };
  }

  if (!response.ok) {
    return { data: null, error: new Error(`HTTP ${response.status} ${response.statusText}`.trim()), response };
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    const redirectDetail = response.redirected ? `, redirected to ${response.url}` : "";
    return {
      data: null,
      error: new Error(`HTTP ${response.status}, JSON이 아닌 응답 (${contentType || "content-type 없음"}${redirectDetail})`),
      response,
    };
  }

  try {
    return { data: await response.json() as T, error: null, response };
  } catch {
    return { data: null, error: new Error("JSON 응답을 해석할 수 없습니다."), response };
  }
}
