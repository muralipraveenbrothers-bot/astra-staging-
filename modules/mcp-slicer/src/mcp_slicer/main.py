from .mcp_server import mcp

def main():
    return mcp.run()

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
