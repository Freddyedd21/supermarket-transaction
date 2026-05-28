import psycopg2
from psycopg2.extras import RealDictCursor

def get_db():
    # Recuerda cambiar estos datos por los de tu base de datos local
    return psycopg2.connect(
        host="localhost",
        database="supermercado_db",
        user="postgres",
        password="tu_password",
        cursor_factory=RealDictCursor
    )