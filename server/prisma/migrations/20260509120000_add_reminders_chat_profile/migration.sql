ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "about" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarSize" INTEGER NOT NULL DEFAULT 72;

CREATE TABLE IF NOT EXISTS "ReminderCompletion" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReminderCompletion_sourceType_sourceId_userId_key" ON "ReminderCompletion"("sourceType", "sourceId", "userId");

ALTER TABLE "ReminderCompletion"
ADD CONSTRAINT "ReminderCompletion_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Friendship_requesterId_receiverId_key" ON "Friendship"("requesterId", "receiverId");

ALTER TABLE "Friendship"
ADD CONSTRAINT "Friendship_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Friendship"
ADD CONSTRAINT "Friendship_receiverId_fkey"
FOREIGN KEY ("receiverId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_receiverId_fkey"
FOREIGN KEY ("receiverId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
