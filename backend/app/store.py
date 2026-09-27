"""Only AI mission state is stored here; Graph8 remains the revenue system of record."""
import json
import sqlite3
from .schemas import Mission

class MissionStore:
    def __init__(self, path):
        self.path = path
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def save(self, mission):
        data = mission.model_dump(mode='json')
        data['candidates'] = mission.candidates
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO missions VALUES (?, ?)', (mission.id, json.dumps(data)))

    def get(self, mission_id):
        with self.connect() as db:
            row = db.execute('SELECT payload FROM missions WHERE id = ?', (mission_id,)).fetchone()
        return Mission.model_validate_json(row[0]) if row else None
