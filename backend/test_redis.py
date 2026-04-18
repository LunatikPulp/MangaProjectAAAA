import redis
r = redis.from_url("redis://localhost:6379/0", decode_responses=True)
r.setex("test", 60, "hello")
print(r.get("test"))
r.delete("test")
print("OK")
