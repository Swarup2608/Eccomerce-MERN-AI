import {randomUUID} from "node:crypto";
import type {RequestHandler} from "express";

export const requestId:RequestHandler = (req,res,next)=>{
    const exisitingRequestId = req.header("X-Request-ID");
    const id = exisitingRequestId ?? randomUUID();
    res.setHeader("X-Request-ID", id);
    res.locals.requestId = id;
    next();
}