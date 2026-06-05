import re


class PrivacyService:
    """PII stripping for master library promotion."""

    VESSEL_NAME_PATTERN = re.compile(r"\bM[/.]?V\.?\s+\w+", re.IGNORECASE)
    IMO_PATTERN = re.compile(r"\bIMO\s*\d{7}\b")
    SERIAL_PATTERN = re.compile(r"\b[A-Z]{2,4}[-/]\d{4,}[-/]?\w*\b")

    def strip_master_metadata(self, text: str, tenant_name: str = "") -> str:
        """
        Remove PII from text before master library promotion:
        - Vessel names (M/V, MV patterns)
        - IMO numbers
        - Serial numbers
        - Company/tenant names
        """
        result = self.VESSEL_NAME_PATTERN.sub("[VESSEL]", text)
        result = self.IMO_PATTERN.sub("[IMO]", result)
        result = self.SERIAL_PATTERN.sub("[SERIAL]", result)
        if tenant_name:
            result = result.replace(tenant_name, "[COMPANY]")
        return result
