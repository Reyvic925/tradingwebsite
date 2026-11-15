"""Decode the provider's minute BID reference bars for spot metals and oil CFDs."""
import datetime
import json
import lzma
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

INSTRUMENTS = {"XAU-USD": "XAUUSD", "XAUUSD": "XAUUSD", "WTI": "LIGHTCMDUSD", "BRENT": "BRENTCMDUSD"}
symbol, day = sys.argv[1:3]
captured = Path(sys.argv[3]) if len(sys.argv) > 3 else None
instrument = INSTRUMENTS[symbol]
date = datetime.date.fromisoformat(day)
url = f"https://datafeed.dukascopy.com/datafeed/{instrument}/{date.year}/{date.month - 1:02}/{date.day:02}/BID_candles_min_1.bi5"
bars = []
for attempt in range(3):
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "ApexPrime-Historical-Data-Verification/1.0"})
        if captured:
            data = lzma.decompress(captured.read_bytes())
        else:
            with urllib.request.urlopen(request, timeout=12) as response:
                data = lzma.decompress(response.read())
        if len(data) % 24:
            raise ValueError("Invalid historical candle length")
        start = datetime.datetime.combine(date, datetime.time(), tzinfo=datetime.timezone.utc)
        for offset in range(0, len(data), 24):
            seconds, opening, closing, low, high, volume = struct.unpack(">5If", data[offset:offset + 24])
            if not 0 <= seconds < 86400 or not 0 < low <= min(opening, closing) <= max(opening, closing) <= high:
                raise ValueError("Invalid provider OHLC candle")
            at = start + datetime.timedelta(seconds=seconds)
            bars.append({"at": at.isoformat().replace("+00:00", "Z"),
                         "end": (at + datetime.timedelta(minutes=1)).isoformat().replace("+00:00", "Z"),
                         "open": opening / 1000, "close": closing / 1000,
                         "low": low / 1000, "high": high / 1000,
                         "source": f"Dukascopy historical {instrument} BID",
                         "kind": "1m BID bar open reference", "url": url})
        break
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            break
        delay = int(error.headers.get("Retry-After", "5")) if error.code == 429 else 3
        if delay > 60:
            break
        time.sleep(delay)
    except (urllib.error.URLError, TimeoutError):
        time.sleep(3)
print(json.dumps(bars))
