import redis, json
r = redis.from_url("redis://localhost:6379/0", decode_responses=True)
test_data = {"hello": "world", "num": 12345}
r.setex("test_cache", 60, json.dumps(test_data))
print("setex OK:", r.get("test_cache"))
r.delete("test_cache")
