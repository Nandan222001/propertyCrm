"""Plot map: a plot maps to the drawing by its number alone ("COMM-01" -> plot 1)."""

from __future__ import annotations

import pytest

from app.core.validators import plot_number_key


@pytest.mark.parametrize("entered,expected", [
    ("COMM-01", "1"), ("A/01", "1"), ("01", "1"), ("1", "1"), ("Plot 07", "7"),
    ("block-1/12", "112"), ("0012", "12"), ("PLOT-A", "plot-a"), ("", ""), (None, ""),
])
def test_plot_number_key_uses_digits_alone(entered, expected):
    assert plot_number_key(entered) == expected
