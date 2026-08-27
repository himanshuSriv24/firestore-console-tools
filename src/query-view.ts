// The console's query builder encodes its query in the URL, and unlike the
// panel's funnel it accepts the reserved __name__ field. Building that URL is
// how a prefix search runs server-side: no paging, and none of the ~600-row
// ceiling the data list imposes.
//
// Grammar, read off a query the console itself produced:
//   2|LIM|2/50|WH|1|8/__name__|GTE|STR|3/p60
//   <clauses>|LIM|<len>/<limit>|WH|<conditions>|<len>/<field>|<op>|<type>|<len>/<value>
// Every value is prefixed with its length in characters.
const RESULT_LIMIT = "50";
const DOCUMENT_ID_FIELD = "__name__";

export class QueryView {
  static prefixUrl(collectionPath: string[], prefix: string): string {
    const url = new URL(location.href);

    url.searchParams.set("view", "query-view");
    url.searchParams.set("query", this.prefixQuery(prefix));
    url.searchParams.set("scopeType", "collection");
    url.searchParams.set("scopeName", collectionPath.join("/"));

    return url.toString();
  }

  private static prefixQuery(prefix: string): string {
    return [
      "2",
      "LIM",
      this.sized(RESULT_LIMIT),
      "WH",
      "1",
      this.sized(DOCUMENT_ID_FIELD),
      "GTE",
      "STR",
      this.sized(prefix),
    ].join("|");
  }

  private static sized(value: string): string {
    return `${value.length}/${value}`;
  }
}
