FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY upstream/Ankh upstream/Ankh
COPY apps/ankh-service apps/ankh-service
RUN dotnet publish apps/ankh-service/RoomWave.Ankh.csproj -c Release -o /out -p:UseAppHost=false -p:BuildInParallel=false -m:1
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:8080 DOTNET_GCHeapHardLimit=0x6000000 DOTNET_gcServer=0
USER $APP_UID
ENTRYPOINT ["dotnet","RoomWave.Ankh.dll"]
