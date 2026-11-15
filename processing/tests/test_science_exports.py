from datetime import date
from unittest.mock import Mock

from backend.processing import export_environment, export_frontend


def test_export_provenance_is_identical_for_lf_and_crlf(monkeypatch, tmp_path):
    catalog = export_frontend.INPUT.read_bytes().replace(b'\r\n', b'\n')
    path = tmp_path / 'catalog.json'
    monkeypatch.setattr(export_frontend, 'INPUT', path)
    path.write_bytes(catalog)
    first = export_frontend.outputs('2026-11-15T00:00:00+00:00')
    path.write_bytes(catalog.replace(b'\n', b'\r\n'))
    assert export_frontend.outputs('2026-11-15T00:00:00+00:00') == first


def test_environment_preserves_zero_and_encodes_missing_days():
    session = Mock()
    response = session.get.return_value
    response.json.return_value = {
        'header': {
            'start': '20250101',
            'end': '20250103',
            'time_standard': 'LST',
            'fill_value': -999,
            'api': {'version': 'test'},
            'sources': [],
        },
        'geometry': {'coordinates': [-69.24, -36.42]},
        'parameters': {key: {'units': 'test'} for key in export_environment.PARAMETERS},
        'properties': {
            'parameter': {
                key: {'20250101': 0, '20250102': -999}
                for key in export_environment.PARAMETERS
            },
        },
    }
    site = export_environment.read_site(
        session, {'id': 'payun-sector', 'center': [-69.241, -36.422]},
        date(2025, 1, 1), date(2025, 1, 3),
    )
    for variable in site['variables'].values():
        assert variable['validDays'] == 1
        assert variable['mean'] == 0
        assert variable['daily'] == {'2025-01-01': 0, '2025-01-02': None, '2025-01-03': None}
