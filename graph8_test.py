"""Read-only Graph8 connection check. Loads credentials from .env securely."""
import asyncio
from backend.app.config import settings
from backend.app.graph8 import Graph8Client, IntegrationError


async def check():
    try:
        result = await Graph8Client(settings).request(
            'GET', '/contacts', params={'limit': 1}
        )
    except IntegrationError as exc:
        raise SystemExit(f'Connection failed: {exc}') from None
    print('Graph8 connection verified.')
    print(f"Contacts returned: {len(result['data'])}")
    print('Credentials and contact details are not printed.')
    print('No records were created or changed.')


def main():
    asyncio.run(check())


if __name__ == '__main__':
    main()
