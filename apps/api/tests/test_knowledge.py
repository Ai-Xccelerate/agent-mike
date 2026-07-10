from app.services.knowledge import InvalidOKFDocument, split_markdown


def test_split_markdown_preserves_headings():
    chunks = split_markdown("# Setup\nFirst step.\n\n# Limits\nSecond step.")
    assert chunks == [("Setup", "First step."), ("Limits", "Second step.")]


def test_split_markdown_chunks_long_sections():
    chunks = split_markdown("# Guide\n" + "word " * 1000, max_chars=200)
    assert len(chunks) > 2
    assert all(0 < len(content) <= 205 for _, content in chunks)


def test_invalid_okf_error_is_specific():
    assert issubclass(InvalidOKFDocument, ValueError)
