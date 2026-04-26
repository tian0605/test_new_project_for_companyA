from email.message import Message
from urllib.parse import parse_qs


class MiniField:
    def __init__(self, name, value):
        self.name = name
        self.value = value
        self.filename = None
        self.file = None
        self.disposition_options = {}


class FieldStorage(dict):
    def __init__(self, fp=None, headers=None, outerboundary=b'', environ=None, keep_blank_values=False, strict_parsing=False, limit=None, encoding='utf-8', errors='replace', max_num_fields=None, separator='&'):
        super().__init__()
        self.fp = fp
        self.headers = headers or Message()
        self.outerboundary = outerboundary
        self.environ = environ or {}
        self.keep_blank_values = keep_blank_values
        self.strict_parsing = strict_parsing
        self.limit = limit
        self.encoding = encoding
        self.errors = errors
        self.max_num_fields = max_num_fields
        self.separator = separator
        self.list = []

        query_string = self.environ.get('QUERY_STRING') or ''
        parsed_values = parse_qs(
            query_string,
            keep_blank_values=keep_blank_values,
            strict_parsing=strict_parsing,
            encoding=encoding,
            errors=errors,
            max_num_fields=max_num_fields,
            separator=separator,
        )

        for key, values in parsed_values.items():
            fields = [MiniField(key, value) for value in values]
            self.list.extend(fields)
            self[key] = fields if len(fields) > 1 else fields[0]