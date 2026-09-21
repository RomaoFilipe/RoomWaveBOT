using Ankh.Handlers;
using Ankh.Models.Rework;
using Microsoft.Extensions.Caching.Memory;
using System.Text.RegularExpressions;
var builder=WebApplication.CreateSlimBuilder(args);
builder.Services.AddMemoryCache(x=>x.SizeLimit=100);
builder.Services.AddHttpClient<UserHandler>(c=>c.Timeout=TimeSpan.FromSeconds(8));
builder.Services.AddHttpClient<RoomHandler>(c=>c.Timeout=TimeSpan.FromSeconds(8));
builder.Logging.SetMinimumLevel(LogLevel.Critical);
var app=builder.Build();
var gate=new SemaphoreSlim(2);
app.MapGet("/health",()=>Results.Ok(new {service="RoomWave Ankh",library="Yucked/Ankh",revision="baefed7dcc9692c7f0ab31fac4d843031300432e",status="ok"}));
app.MapGet("/api/info/user",async(string userId,UserHandler handler,IMemoryCache cache)=>{
 if(!Regex.IsMatch(userId,"^[0-9]{1,20}$")||!long.TryParse(userId,out var cid)||cid<=0)return Results.BadRequest(new {error="INVALID_IMVU_USER"});
 var key="user:"+userId;if(cache.TryGetValue(key,out object? saved))return Results.Ok(saved);
 if(!await gate.WaitAsync(0))return Results.Json(new {error="ANKH_BUSY"},statusCode:429);
 try{
  var user=await handler.GetUserByIdAsync(userId);
  if(user.Id!=userId||string.IsNullOrWhiteSpace(user.Username))return Results.NotFound(new {error="IMVU_NOT_FOUND"});
  var result=new {kind="user",id=user.Id,username=user.Username,displayName=user.DisplayName??user.Username,created=user.CreatedOn.ToString("O"),isCreator=user.IsCreator,isVip=(bool?)null,source="Ankh",profileUrl=$"https://www.imvu.com/next/av/{userId}/",fetchedAt=DateTimeOffset.UtcNow};
  cache.Set(key,(object)result,new MemoryCacheEntryOptions().SetSize(1).SetAbsoluteExpiration(TimeSpan.FromMinutes(1)));return Results.Ok(result);
 }catch{return Results.Json(new {error="ANKH_UPSTREAM_ERROR"},statusCode:502);}finally{gate.Release();}
});
app.MapPost("/api/info/room",async(string roomId,RoomHandler handler,IMemoryCache cache)=>{
 if(!Regex.IsMatch(roomId,"^[0-9]{1,20}-[0-9]{1,20}$"))return Results.BadRequest(new {error="INVALID_IMVU_ROOM"});
 var key="room:"+roomId;if(cache.TryGetValue(key,out object? saved))return Results.Ok(saved);
 if(!await gate.WaitAsync(0))return Results.Json(new {error="ANKH_BUSY"},statusCode:429);
 try{
  var room=await handler.GetRoomByIdAsync(new UserLogin {SessionId=""},roomId);
  if(string.IsNullOrWhiteSpace(room.Name)||room.OwnerId.ToString()!=roomId.Split('-')[0])return Results.NotFound(new {error="IMVU_NOT_FOUND"});
  var result=new {kind="room",id=roomId,name=room.Name,description=room.Description,ownerId=room.OwnerId.ToString(),ownerName=room.OwnerUsername,capacity=room.Capacity,privacy=room.Privacy,language=room.Language,source="Ankh",roomUrl=$"https://go.imvu.com/chat/room-{roomId}",fetchedAt=DateTimeOffset.UtcNow};
  cache.Set(key,(object)result,new MemoryCacheEntryOptions().SetSize(1).SetAbsoluteExpiration(TimeSpan.FromMinutes(1)));return Results.Ok(result);
 }catch{return Results.Json(new {error="ANKH_UPSTREAM_ERROR"},statusCode:502);}finally{gate.Release();}
});
app.Run();
